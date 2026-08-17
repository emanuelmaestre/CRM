import { createRequire } from "node:module";
import postgres from "postgres";
import { resolveDatabaseConnectionString } from "./database-url.mjs";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");
loadEnvConfig(process.cwd());

const marketplaces = ["mercadolivre", "shopee", "tiktokshop"];
const requiredGlobalEnv = [
  "DATABASE_URL",
  "DEFAULT_ORG_ID",
  "INNGEST_SIGNING_KEY",
  "INNGEST_EVENT_KEY",
];

function configured(name) {
  const value = process.env[name]?.trim();
  return Boolean(value && !/^(your-|replace-|changeme|placeholder)/i.test(value));
}

if (!configured("DATABASE_URL")) {
  console.error(JSON.stringify({
    status: "blocked",
    blockers: ["DATABASE_URL ausente; verificação de produção não executada."],
  }, null, 2));
  process.exit(1);
}

const sql = postgres(resolveDatabaseConnectionString(process.env.DATABASE_URL), {
  prepare: false,
  max: 1,
  connect_timeout: 10,
});

try {
  const accounts = await sql`
    select
      ca.id,
      ca.tipo,
      b.slug as brand,
      ca.status,
      ca.ultima_verificacao,
      coalesce(ca.meta->>'externalAccountId', '') <> '' as has_external_id,
      count(pc.id)::int as mappings
    from channel_account ca
    join brand b on b.id = ca.brand_id and b.org_id = ca.org_id
    left join produto_canal pc
      on pc.channel_account_id = ca.id and pc.ativo = true
    where ca.org_id = ${process.env.DEFAULT_ORG_ID ?? ""}
      and ca.tipo::text = any(${marketplaces})
    group by ca.id, b.slug
    order by ca.tipo, b.slug
  `;

  const jobs = await sql`
    select distinct on (nome)
      nome, status, iniciado_em, finalizado_em, erro
    from job_run
    where org_id = ${process.env.DEFAULT_ORG_ID ?? ""}
      and nome in ('A18-saude-conectores', 'A23-refresh-ml-tokens', 'A24-poll-pedidos')
    order by nome, iniciado_em desc
  `;

  const orders = await sql`
    with latest as (
      select distinct on (p.canal)
        p.id,
        p.canal,
        p.criado_em,
        p.recebido_em,
        extract(epoch from (p.recebido_em - p.criado_em)) as latency_seconds
      from pedido p
      where p.org_id = ${process.env.DEFAULT_ORG_ID ?? ""}
        and p.canal = any(${marketplaces})
        and p.provider_order_id is not null
        and p.recebido_em >= now() - interval '30 days'
      order by p.canal, p.recebido_em desc
    )
    select
      latest.canal,
      latest.criado_em,
      latest.recebido_em,
      latest.latency_seconds,
      exists (
        select 1 from evento_dominio ed
        where ed.org_id = ${process.env.DEFAULT_ORG_ID ?? ""}
          and ed.tipo = 'estoque.sincronizado'
          and ed.criado_em >= latest.recebido_em
      ) as stock_synced
    from latest
    order by latest.canal
  `;

  const inbox = await sql`
    select ca.tipo, count(m.id)::int as messages
    from channel_account ca
    left join conversa c on c.channel_account_id = ca.id and c.org_id = ca.org_id
    left join mensagem m
      on m.conversa_id = c.id
      and m.org_id = ca.org_id
      and m.direcao = 'entrada'
      and m.criado_em >= now() - interval '30 days'
    where ca.org_id = ${process.env.DEFAULT_ORG_ID ?? ""}
      and ca.tipo::text = any(${marketplaces})
    group by ca.tipo
    order by ca.tipo
  `;

  const tokenSummary = await sql`
    select canal, count(*)::int as total,
      count(*) filter (where expires_at is null or expires_at > now() + interval '5 minutes')::int as valid
    from canal_tokens
    where org_id = ${process.env.DEFAULT_ORG_ID ?? ""}
    group by canal
    order by canal
  `;

  const missingEnv = requiredGlobalEnv.filter((name) => !configured(name));
  const accountBlockers = [];
  for (const channel of marketplaces) {
    const channelAccounts = accounts.filter((account) => account.tipo === channel);
    if (channelAccounts.length === 0) {
      accountBlockers.push(`${channel}: nenhuma conta cadastrada`);
      continue;
    }
    for (const account of channelAccounts) {
      const upper = account.brand.toUpperCase();
      const externalIdEnv = {
        mercadolivre: `ML_SELLER_ID_${upper}`,
        shopee: `SHOPEE_SHOP_ID_${upper}`,
        tiktokshop: `TIKTOK_SHOP_ID_${upper}`,
      }[channel];
      if (account.status !== "conectado") {
        accountBlockers.push(`${channel}/${account.brand}: status ${account.status}`);
      }
      if (!account.has_external_id && !configured(externalIdEnv)) {
        accountBlockers.push(`${channel}/${account.brand}: externalAccountId ausente`);
      }
      if (account.mappings === 0) {
        accountBlockers.push(`${channel}/${account.brand}: nenhum produto mapeado`);
      }
    }
  }

  const credentialEnv = {
    shopee: ["SHOPEE_PARTNER_ID", "SHOPEE_PARTNER_KEY"],
    tiktokshop: ["TIKTOK_APP_KEY", "TIKTOK_APP_SECRET"],
  };
  for (const account of accounts) {
    const upper = account.brand.toUpperCase();
    const perBrand = {
      shopee: [`SHOPEE_ACCESS_TOKEN_${upper}`, `SHOPEE_SHOP_ID_${upper}`],
      tiktokshop: [`TIKTOK_ACCESS_TOKEN_${upper}`, `TIKTOK_SHOP_CIPHER_${upper}`, `TIKTOK_SHOP_ID_${upper}`],
    }[account.tipo] ?? [];
    missingEnv.push(
      ...(credentialEnv[account.tipo] ?? []).filter((name) => !configured(name)),
      ...perBrand.filter((name) => !configured(name)),
    );
  }
  const mlAccounts = accounts.filter((account) => account.tipo === "mercadolivre");
  if (mlAccounts.length > 0) {
    for (const name of ["ML_CLIENT_ID", "ML_CLIENT_SECRET"]) {
      if (!configured(name)) missingEnv.push(name);
    }
    const mlTokens = tokenSummary.find((item) => item.canal === "mercadolivre");
    if (!mlTokens || mlTokens.valid < mlAccounts.length) {
      accountBlockers.push("mercadolivre: token OAuth válido ausente para uma ou mais contas");
    }
  }

  const now = Date.now();
  const jobBlockers = [
    ["A18-saude-conectores", 20],
    ["A23-refresh-ml-tokens", 70],
    ["A24-poll-pedidos", 10],
  ].flatMap(([name, maxAgeMinutes]) => {
    const job = jobs.find((item) => item.nome === name);
    if (!job) return [`${name}: nenhuma execução registrada`];
    const age = now - new Date(job.iniciado_em).getTime();
    if (job.status !== "concluido") return [`${name}: última execução ${job.status}`];
    if (age > maxAgeMinutes * 60_000) return [`${name}: execução atrasada`];
    return [];
  });

  const orderBlockers = marketplaces.flatMap((channel) => {
    const order = orders.find((item) => item.canal === channel);
    if (!order) return [`${channel}: pedido real recente não comprovado`];
    const latency = Number(order.latency_seconds);
    const failures = [];
    if (latency < 0 || latency > 300) failures.push(`${channel}: ingestão em ${Math.round(latency)}s (> 300s)`);
    if (!order.stock_synced) failures.push(`${channel}: sincronização remota não comprovada`);
    return failures;
  });

  const inboxBlockers = marketplaces.flatMap((channel) => {
    const row = inbox.find((item) => item.tipo === channel);
    return row?.messages > 0 ? [] : [`${channel}: inbox sem mensagem real recente`];
  });

  const blockers = [
    ...new Set(missingEnv.map((name) => `env ausente: ${name}`)),
    ...accountBlockers,
    ...jobBlockers,
    ...orderBlockers,
    ...inboxBlockers,
  ];
  const report = {
    status: blockers.length === 0 ? "passed" : "blocked",
    checkedAt: new Date().toISOString(),
    externalSendsEnabled: process.env.EXTERNAL_SENDS_ENABLED === "true",
    summary: {
      marketplaceAccounts: accounts.length,
      connectedAccounts: accounts.filter((account) => account.status === "conectado").length,
      recentRealOrderChannels: orders.length,
      recentInboxChannels: inbox.filter((item) => item.messages > 0).length,
      jobsObserved: jobs.length,
    },
    blockers,
  };
  console.log(JSON.stringify(report, null, 2));
  if (blockers.length > 0) process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
