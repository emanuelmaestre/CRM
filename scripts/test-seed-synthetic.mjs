import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import postgres from "postgres";
import {
  assertSyntheticSeedTarget,
  loadSyntheticCatalog,
  seedSyntheticData,
  upsertFunnelStage,
} from "./synthetic-seed-lib.mjs";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");

loadEnvConfig(process.cwd());

class RollbackOnly extends Error {}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL não configurada para testar o seed sintético.");
}

const testEnv = {
  ...process.env,
  SYNTHETIC_SEED_ANCHOR_DATE: process.env.SYNTHETIC_SEED_ANCHOR_DATE || "2026-07-22",
};

assert.throws(
  () => assertSyntheticSeedTarget("postgresql://user:pass@remote.example.invalid/crm", {}),
  /Seed remoto bloqueado/,
  "Banco remoto deve ser recusado sem confirmação explícita.",
);
assert.throws(
  () => assertSyntheticSeedTarget("postgresql://user:pass@remote.example.invalid/crm", {
    VERCEL_ENV: "production",
    SYNTHETIC_SEED_ENV: "staging",
    SYNTHETIC_SEED_REMOTE_CONFIRMATION: "seed-synthetic-data",
  }),
  /produção/,
  "Banco remoto deve ser recusado quando houver sinal de produção.",
);
assert.doesNotThrow(() => assertSyntheticSeedTarget("postgresql://user:pass@remote.example.invalid/crm", {
  SYNTHETIC_SEED_ENV: "staging",
  SYNTHETIC_SEED_REMOTE_CONFIRMATION: "seed-synthetic-data",
}));

const catalogTemplate = await loadSyntheticCatalog(testEnv);
const alternateCatalog = await loadSyntheticCatalog({
  ...testEnv,
  DEFAULT_ORG_ID: randomUUID(),
});
assert.notEqual(
  alternateCatalog.organization.cnpj,
  catalogTemplate.organization.cnpj,
  "A chave natural sintética deve mudar quando DEFAULT_ORG_ID mudar.",
);

// Duas aplicações consecutivas comprovam que a carga é reexecutável.
await seedSyntheticData({ databaseUrl: process.env.DATABASE_URL, env: testEnv });
const { catalog } = await seedSyntheticData({ databaseUrl: process.env.DATABASE_URL, env: testEnv });

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 10 });

const tableExpectations = [
  ["brand", catalog.brands.map((item) => item.id)],
  ["app_user", catalog.users.map((item) => item.id)],
  ["channel_account", catalog.channelAccounts.map((item) => item.id)],
  ["cliente", catalog.clients.map((item) => item.id)],
  ["cliente_identidade", catalog.clientIdentities.map((item) => item.id)],
  ["consentimento", catalog.consents.map((item) => item.id)],
  ["tag", catalog.tags.map((item) => item.id)],
  ["segmento", catalog.segments.map((item) => item.id)],
  ["interacao", catalog.interactions.map((item) => item.id)],
  ["produto", catalog.products.map((item) => item.id)],
  ["estoque_saldo", catalog.products.map((item) => item.balanceId)],
  ["estoque_movimento", catalog.stockMovements.map((item) => item.id)],
  ["produto_canal", catalog.productChannels.map((item) => item.id)],
  ["funil_etapa", catalog.funnelStages.map((item) => item.id)],
  ["pedido", catalog.orders.map((item) => item.id)],
  ["pedido_item", catalog.orderItems.map((item) => item.id)],
  ["oportunidade", catalog.opportunities.map((item) => item.id)],
  ["tarefa", catalog.tasks.map((item) => item.id)],
  ["evento_agenda", catalog.calendarEvents.map((item) => item.id)],
  ["conversa", catalog.conversations.map((item) => item.id)],
  ["mensagem", catalog.messages.map((item) => item.id)],
  ["score_cliente", catalog.clientScores.map((item) => item.id)],
  ["score_produto", catalog.productScores.map((item) => item.id)],
  ["sugestao_campanha", catalog.campaignSuggestions.map((item) => item.id)],
  ["insight", catalog.insights.map((item) => item.id)],
  ["audit_log", catalog.auditLogs.map((item) => item.id)],
];

try {
  const [organization] = await sql`
    select id::text, name, cnpj, active
    from public.org
    where id = ${catalog.organization.id}
  `;
  assert.equal(organization?.id, catalog.organization.id);
  assert.equal(organization?.active, true);
  assert.match(organization?.cnpj || "", /^synthetic-/);

  for (const [table, ids] of tableExpectations) {
    const [result] = await sql.unsafe(
      `select count(*)::int as count from public.${table} where id = any($1::uuid[])`,
      [ids],
    );
    assert.equal(result.count, ids.length, `${table} deve conter todos os registros sintéticos esperados.`);
  }

  const [clientTagCount] = await sql`
    select count(*)::int as count
    from public.cliente_tag ct
    inner join public.cliente c on c.id = ct.cliente_id
    inner join public.tag t on t.id = ct.tag_id
    where c.org_id = ${catalog.organization.id}
      and c.id in ${sql(catalog.clients.map((item) => item.id))}
      and t.id in ${sql(catalog.tags.map((item) => item.id))}
  `;
  assert.equal(clientTagCount.count, catalog.clientTags.length, "Reexecução não pode duplicar vínculos cliente-tag.");

  const unsafeClients = await sql`
    select id from public.cliente
    where id in ${sql(catalog.clients.map((item) => item.id))}
      and (email not like '%.invalid' or cpf_cnpj is not null)
  `;
  assert.equal(unsafeClients.length, 0, "Clientes sintéticos não podem conter e-mail real ou CPF/CNPJ.");

  const unsafeChannels = await sql`
    select id from public.channel_account
    where id in ${sql(catalog.channelAccounts.map((item) => item.id))}
      and (
        status <> 'desconectado'
        or vault_key not like 'synthetic/disabled/%'
        or coalesce((meta ->> 'externalSendsEnabled')::boolean, true)
      )
  `;
  assert.equal(unsafeChannels.length, 0, "Canais sintéticos devem permanecer desconectados e sem envio externo.");

  const profiles = await sql`
    select perfil, count(*)::int as count
    from public.app_user
    where id in ${sql(catalog.users.map((item) => item.id))}
    group by perfil
  `;
  assert.deepEqual(
    new Set(profiles.map((row) => row.perfil)),
    new Set(["admin", "gestor", "vendedor"]),
    "O seed deve cobrir os três perfis da Fase A.",
  );

  const wrongOrgRows = await sql`
    select source, count(*)::int as count
    from (
      select 'cliente' as source, org_id from public.cliente
        where id in ${sql(catalog.clients.map((item) => item.id))}
      union all
      select 'produto', org_id from public.produto
        where id in ${sql(catalog.products.map((item) => item.id))}
      union all
      select 'pedido', org_id from public.pedido
        where id in ${sql(catalog.orders.map((item) => item.id))}
      union all
      select 'conversa', org_id from public.conversa
        where id in ${sql(catalog.conversations.map((item) => item.id))}
    ) scoped
    where org_id <> ${catalog.organization.id}
    group by source
  `;
  assert.equal(wrongOrgRows.length, 0, "Todos os registros sintéticos devem permanecer no tenant configurado.");

  const balances = await sql`
    select produto_id::text, saldo
    from public.estoque_saldo
    where id in ${sql(catalog.products.map((item) => item.balanceId))}
  `;
  const expectedBalances = new Map(catalog.products.map((item) => [item.id, item.balance]));
  for (const balance of balances) {
    assert.equal(balance.saldo, expectedBalances.get(balance.produto_id));
  }

  const legacyOrgId = randomUUID();
  const legacyStageId = randomUUID();
  await assert.rejects(
    sql.begin(async (tx) => {
      await tx`
        insert into public.org (id, name, cnpj)
        values (${legacyOrgId}, 'Tenant temporário do seed', ${`test-${legacyOrgId}`})
      `;
      await tx`
        insert into public.funil_etapa (id, org_id, nome, ordem, cor)
        values (${legacyStageId}, ${legacyOrgId}, 'Etapa legada', 1, '#000000')
      `;

      const resolvedId = await upsertFunnelStage(tx, legacyOrgId, {
        id: randomUUID(),
        name: "Etapa reconciliada",
        order: 1,
        color: "#22c55e",
      });
      assert.equal(resolvedId, legacyStageId, "A reconciliação deve preservar o ID natural já referenciado.");

      const [stage] = await tx`
        select nome, cor from public.funil_etapa
        where id = ${legacyStageId}
      `;
      assert.equal(stage.nome, "Etapa reconciliada");
      assert.equal(stage.cor, "#22c55e");
      throw new RollbackOnly();
    }),
    (error) => error instanceof RollbackOnly,
    "A regressão de chave natural deve ser validada sem persistir fixtures temporárias.",
  );

  await assert.rejects(
    sql`insert into public.cliente (id, org_id, nome, email)
        values (${randomUUID()}, ${catalog.organization.id}, 'Duplicado sintético', ${catalog.clients[0].email})`,
    (error) => error?.code === "23505",
    "O banco deve impedir cliente ativo com e-mail duplicado no mesmo tenant.",
  );

  await assert.rejects(
    sql`insert into public.produto (id, org_id, brand_id, sku, nome, preco)
        values (${randomUUID()}, ${catalog.organization.id}, ${catalog.brands[0].id},
                ${catalog.products[0].sku}, 'SKU duplicado', '10.00')`,
    (error) => error?.code === "23505",
    "O banco deve impedir SKU ativo duplicado no mesmo tenant.",
  );

  await assert.rejects(
    sql`insert into public.produto (id, org_id, brand_id, sku, nome, preco)
        values (${randomUUID()}, ${catalog.organization.id}, ${catalog.brands[0].id},
                ${`ZERO-${randomUUID()}`}, 'Preço inválido', '0.00')`,
    (error) => error?.code === "23514",
    "O banco deve impedir produto com preço zerado.",
  );

  const foreignOrgId = randomUUID();
  const foreignStageId = randomUUID();
  await assert.rejects(
    sql.begin(async (tx) => {
      await tx`insert into public.org (id, name, cnpj) values (${foreignOrgId}, 'Tenant externo', ${`test-${foreignOrgId}`})`;
      await tx`insert into public.funil_etapa (id, org_id, nome, ordem) values (${foreignStageId}, ${foreignOrgId}, 'Etapa externa', 1)`;
      await tx`insert into public.oportunidade (id, org_id, brand_id, etapa_id, titulo)
               values (${randomUUID()}, ${foreignOrgId}, ${catalog.brands[0].id}, ${foreignStageId}, 'Referência cruzada')`;
    }),
    (error) => error?.code === "23503",
    "O banco deve impedir oportunidade ligada a marca de outro tenant.",
  );

  console.log(
    `Seed sintético validado: ${tableExpectations.length + 2} conjuntos, ` +
    `${catalog.clients.length} clientes e ${catalog.orders.length} pedidos; idempotência confirmada.`,
  );
} finally {
  await sql.end({ timeout: 2 });
}
