import { readFile } from "node:fs/promises";
import postgres from "postgres";

const LOCAL_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const REMOTE_CONFIRMATION = "seed-synthetic-data";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const catalogUrl = new URL("../seeds/synthetic.json", import.meta.url);

export async function loadSyntheticCatalog(env = process.env) {
  const catalog = JSON.parse(await readFile(catalogUrl, "utf8"));

  if (catalog.meta?.kind !== "synthetic" || catalog.meta?.schemaVersion !== 1) {
    throw new Error("Catálogo de seed inválido: kind=synthetic e schemaVersion=1 são obrigatórios.");
  }

  if (env.DEFAULT_ORG_ID) {
    catalog.organization.id = env.DEFAULT_ORG_ID;
    // A chave natural precisa acompanhar o tenant sobrescrito. Sem isso, duas
    // execuções com DEFAULT_ORG_ID diferentes disputam o mesmo CNPJ sintético.
    catalog.organization.cnpj = `synthetic-${env.DEFAULT_ORG_ID}`;
  }
  const brandOverrides = {
    karzi: env.NEXT_PUBLIC_BRAND_ID_KARZI,
    wuwu: env.NEXT_PUBLIC_BRAND_ID_WUWU,
  };
  for (const brand of catalog.brands) {
    brand.id = brandOverrides[brand.key] || brand.id;
  }

  const ids = collectIds(catalog);
  for (const [label, id] of ids) {
    if (!UUID_PATTERN.test(id)) {
      throw new Error(`UUID inválido no seed sintético (${label}): ${id}`);
    }
  }
  const duplicateIds = ids.filter(([, id], index) => ids.findIndex(([, candidate]) => candidate === id) !== index);
  if (duplicateIds.length > 0) {
    throw new Error(`UUID duplicado no seed sintético: ${duplicateIds[0][1]}`);
  }

  for (const user of catalog.users) {
    if (!user.email.endsWith(".invalid")) {
      throw new Error(`E-mail sintético deve usar o domínio reservado .invalid: ${user.email}`);
    }
  }
  for (const client of catalog.clients) {
    if (!client.email.endsWith(".invalid")) {
      throw new Error(`E-mail sintético deve usar o domínio reservado .invalid: ${client.email}`);
    }
  }
  for (const account of catalog.channelAccounts) {
    if (account.status !== "desconectado" || !account.vaultKey.startsWith("synthetic/disabled/")) {
      throw new Error(`Conta de canal sintética insegura: ${account.key}`);
    }
  }

  return catalog;
}

export function assertSyntheticSeedTarget(databaseUrl, env = process.env) {
  const target = new URL(databaseUrl);
  if (LOCAL_DATABASE_HOSTS.has(target.hostname)) return;

  const environment = (env.SYNTHETIC_SEED_ENV || "").toLowerCase();
  const productionSignals = [env.VERCEL_ENV, env.APP_ENV, env.SYNTHETIC_SEED_ENV]
    .filter(Boolean)
    .map((value) => value.toLowerCase());
  if (productionSignals.includes("production")) {
    throw new Error("Seed sintético bloqueado: o ambiente foi identificado como produção.");
  }
  if (!new Set(["development", "dev", "staging", "preview"]).has(environment)) {
    throw new Error("Seed remoto bloqueado: defina SYNTHETIC_SEED_ENV como development, staging ou preview.");
  }
  if (env.SYNTHETIC_SEED_REMOTE_CONFIRMATION !== REMOTE_CONFIRMATION) {
    throw new Error(`Seed remoto bloqueado: confirme com SYNTHETIC_SEED_REMOTE_CONFIRMATION=${REMOTE_CONFIRMATION}.`);
  }
}

export function resolveAnchorDate(env = process.env) {
  const value = env.SYNTHETIC_SEED_ANCHOR_DATE;
  if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("SYNTHETIC_SEED_ANCHOR_DATE deve usar o formato YYYY-MM-DD.");
  }
  const anchor = value ? new Date(`${value}T12:00:00.000Z`) : new Date();
  anchor.setUTCHours(12, 0, 0, 0);
  if (Number.isNaN(anchor.getTime())) throw new Error("Data âncora inválida para o seed sintético.");
  return anchor;
}

export async function seedSyntheticData({ databaseUrl, env = process.env } = {}) {
  if (!databaseUrl) throw new Error("DATABASE_URL não configurada para o seed sintético.");
  assertSyntheticSeedTarget(databaseUrl, env);
  const catalog = await loadSyntheticCatalog(env);
  const anchor = resolveAnchorDate(env);
  const sql = postgres(databaseUrl, { max: 1, prepare: false, connect_timeout: 10 });

  try {
    await sql.begin(async (tx) => {
      await applyCatalog(tx, catalog, anchor);
    });
  } finally {
    await sql.end({ timeout: 2 });
  }

  return { catalog, anchor };
}

function collectIds(catalog) {
  const collections = [
    "brands", "users", "channelAccounts", "clients", "clientIdentities", "consents", "tags",
    "segments", "interactions", "products", "stockMovements", "productChannels", "funnelStages",
    "orders", "orderItems", "opportunities", "tasks", "calendarEvents", "conversations", "messages",
    "clientScores", "productScores", "insights", "auditLogs",
  ];
  const ids = [["organization", catalog.organization.id]];
  for (const collection of collections) {
    for (const [index, item] of catalog[collection].entries()) {
      ids.push([`${collection}[${index}]`, item.id]);
      if (collection === "products") ids.push([`${collection}[${index}].balanceId`, item.balanceId]);
    }
  }
  return ids;
}

function mapByKey(items) {
  return new Map(items.map((item) => [item.key, item]));
}

function atOffset(anchor, days, hour = 12) {
  const date = new Date(anchor);
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(hour, 0, 0, 0);
  return date;
}

async function applyCatalog(tx, catalog, anchor) {
  const orgId = catalog.organization.id;
  const brands = mapByKey(catalog.brands);
  const users = mapByKey(catalog.users);
  const channels = mapByKey(catalog.channelAccounts);
  const clients = mapByKey(catalog.clients);
  const tags = mapByKey(catalog.tags);
  const products = mapByKey(catalog.products);
  const stages = mapByKey(catalog.funnelStages);
  const orders = mapByKey(catalog.orders);
  const conversations = mapByKey(catalog.conversations);

  await tx`
    insert into public.org (id, name, cnpj, active, atualizado_em)
    values (${orgId}, ${catalog.organization.name}, ${catalog.organization.cnpj}, true, ${anchor})
    on conflict (id) do update set
      name = excluded.name, cnpj = excluded.cnpj, active = true, atualizado_em = excluded.atualizado_em
  `;

  for (const item of catalog.brands) {
    await tx`
      insert into public.brand (id, org_id, name, slug, active, atualizado_em)
      values (${item.id}, ${orgId}, ${item.name}, ${item.slug}, true, ${anchor})
      on conflict (id) do update set
        org_id = excluded.org_id, name = excluded.name, slug = excluded.slug,
        active = true, atualizado_em = excluded.atualizado_em
    `;
  }

  for (const item of catalog.users) {
    await tx`
      insert into public.app_user (id, org_id, email, nome, perfil, ativo, atualizado_em)
      values (${item.id}, ${orgId}, ${item.email}, ${item.name}, ${item.profile}, true, ${anchor})
      on conflict (id) do update set
        org_id = excluded.org_id, email = excluded.email, nome = excluded.nome,
        perfil = excluded.perfil, ativo = true, atualizado_em = excluded.atualizado_em
    `;
  }

  for (const item of catalog.channelAccounts) {
    const metadata = { synthetic: true, externalSendsEnabled: false };
    await tx`
      insert into public.channel_account
        (id, org_id, brand_id, tipo, nome, status, vault_key, meta, atualizado_em)
      values
        (${item.id}, ${orgId}, ${brands.get(item.brand).id}, ${item.type}, ${item.name},
         ${item.status}, ${item.vaultKey}, ${tx.json(metadata)}, ${anchor})
      on conflict (id) do update set
        org_id = excluded.org_id, brand_id = excluded.brand_id, tipo = excluded.tipo,
        nome = excluded.nome, status = excluded.status, vault_key = excluded.vault_key,
        meta = excluded.meta, ultimo_erro = null, atualizado_em = excluded.atualizado_em
    `;
  }

  for (const item of catalog.clients) {
    const createdAt = atOffset(anchor, -item.createdDaysAgo);
    await tx`
      insert into public.cliente
        (id, org_id, nome, email, telefone, cpf_cnpj, data_nascimento, deleted_at, criado_em, atualizado_em)
      values
        (${item.id}, ${orgId}, ${item.name}, ${item.email}, ${item.phone}, null,
         ${item.birthDate}, null, ${createdAt}, ${createdAt})
      on conflict (id) do update set
        org_id = excluded.org_id, nome = excluded.nome, email = excluded.email,
        telefone = excluded.telefone, cpf_cnpj = null, data_nascimento = excluded.data_nascimento,
        deleted_at = null, criado_em = excluded.criado_em, atualizado_em = excluded.atualizado_em
    `;
  }

  for (const item of catalog.clientIdentities) {
    const metadata = { synthetic: true };
    await tx`
      insert into public.cliente_identidade (id, cliente_id, org_id, canal, external_id, meta)
      values (${item.id}, ${clients.get(item.client).id}, ${orgId}, ${item.channel}, ${item.externalId}, ${tx.json(metadata)})
      on conflict (id) do update set
        cliente_id = excluded.cliente_id, org_id = excluded.org_id, canal = excluded.canal,
        external_id = excluded.external_id, meta = excluded.meta
    `;
  }

  for (const item of catalog.consents) {
    const revokedAt = item.status === "revogado" ? atOffset(anchor, -2) : null;
    await tx`
      insert into public.consentimento
        (id, cliente_id, org_id, brand_id, finalidade, canal, status, origem, prova, revogado_em)
      values
        (${item.id}, ${clients.get(item.client).id}, ${orgId}, ${brands.get(item.brand).id},
         ${item.purpose}, ${item.channel}, ${item.status}, ${item.origin}, 'synthetic-proof', ${revokedAt})
      on conflict (id) do update set
        cliente_id = excluded.cliente_id, org_id = excluded.org_id, brand_id = excluded.brand_id,
        finalidade = excluded.finalidade, canal = excluded.canal, status = excluded.status,
        origem = excluded.origem, prova = excluded.prova, revogado_em = excluded.revogado_em
    `;
  }

  for (const item of catalog.tags) {
    await tx`
      insert into public.tag (id, org_id, nome, cor)
      values (${item.id}, ${orgId}, ${item.name}, ${item.color})
      on conflict (id) do update set org_id = excluded.org_id, nome = excluded.nome, cor = excluded.cor
    `;
  }
  for (const item of catalog.clientTags) {
    await tx`
      insert into public.cliente_tag (cliente_id, tag_id)
      select ${clients.get(item.client).id}, ${tags.get(item.tag).id}
      where not exists (
        select 1 from public.cliente_tag
        where cliente_id = ${clients.get(item.client).id} and tag_id = ${tags.get(item.tag).id}
      )
    `;
  }

  for (const item of catalog.segments) {
    await tx`
      insert into public.segmento (id, org_id, nome, filtros, atualizado_em)
      values (${item.id}, ${orgId}, ${item.name}, ${tx.json(item.filters)}, ${anchor})
      on conflict (id) do update set
        org_id = excluded.org_id, nome = excluded.nome, filtros = excluded.filtros,
        atualizado_em = excluded.atualizado_em
    `;
  }

  for (const item of catalog.interactions) {
    const createdAt = atOffset(anchor, -item.daysAgo);
    await tx`
      insert into public.interacao
        (id, cliente_id, org_id, brand_id, tipo, canal, resumo, meta, autor_id, criado_em)
      values
        (${item.id}, ${clients.get(item.client).id}, ${orgId}, ${brands.get(item.brand).id},
         ${item.type}, ${item.channel}, ${item.summary}, ${tx.json({ synthetic: true })},
         ${users.get(item.author).id}, ${createdAt})
      on conflict (id) do update set
        cliente_id = excluded.cliente_id, org_id = excluded.org_id, brand_id = excluded.brand_id,
        tipo = excluded.tipo, canal = excluded.canal, resumo = excluded.resumo,
        meta = excluded.meta, autor_id = excluded.autor_id, criado_em = excluded.criado_em
    `;
  }

  for (const item of catalog.products) {
    await tx`
      insert into public.produto
        (id, org_id, brand_id, sku, nome, custo, preco, estoque_minimo, ativo, deleted_at, atualizado_em)
      values
        (${item.id}, ${orgId}, ${brands.get(item.brand).id}, ${item.sku}, ${item.name},
         ${item.cost}, ${item.price}, ${item.minimumStock}, true, null, ${anchor})
      on conflict (id) do update set
        org_id = excluded.org_id, brand_id = excluded.brand_id, sku = excluded.sku,
        nome = excluded.nome, custo = excluded.custo, preco = excluded.preco,
        estoque_minimo = excluded.estoque_minimo, ativo = true, deleted_at = null,
        atualizado_em = excluded.atualizado_em
    `;
    await tx`
      insert into public.estoque_saldo (id, org_id, produto_id, saldo, atualizado_em)
      values (${item.balanceId}, ${orgId}, ${item.id}, ${item.balance}, ${anchor})
      on conflict (id) do update set
        org_id = excluded.org_id, produto_id = excluded.produto_id,
        saldo = excluded.saldo, atualizado_em = excluded.atualizado_em
    `;
  }

  for (const item of catalog.stockMovements) {
    const createdAt = atOffset(anchor, -item.daysAgo);
    await tx`
      insert into public.estoque_movimento
        (id, org_id, produto_id, tipo, quantidade, referencia_id, referencia_tipo, observacao, criado_em)
      values
        (${item.id}, ${orgId}, ${products.get(item.product).id}, ${item.type}, ${item.quantity},
         ${item.id}, ${item.referenceType}, ${item.note}, ${createdAt})
      on conflict (id) do update set
        org_id = excluded.org_id, produto_id = excluded.produto_id, tipo = excluded.tipo,
        quantidade = excluded.quantidade, referencia_id = excluded.referencia_id,
        referencia_tipo = excluded.referencia_tipo, observacao = excluded.observacao,
        criado_em = excluded.criado_em
    `;
  }

  for (const item of catalog.productChannels) {
    await tx`
      insert into public.produto_canal
        (id, org_id, produto_id, channel_account_id, external_listing_id, ativo, atualizado_em)
      values
        (${item.id}, ${orgId}, ${products.get(item.product).id}, ${channels.get(item.channelAccount).id},
         ${item.externalListingId}, true, ${anchor})
      on conflict (id) do update set
        org_id = excluded.org_id, produto_id = excluded.produto_id,
        channel_account_id = excluded.channel_account_id,
        external_listing_id = excluded.external_listing_id, ativo = true,
        atualizado_em = excluded.atualizado_em
    `;
  }

  for (const item of catalog.funnelStages) {
    await tx`
      insert into public.funil_etapa (id, org_id, nome, ordem, cor)
      values (${item.id}, ${orgId}, ${item.name}, ${item.order}, ${item.color})
      on conflict (id) do update set
        org_id = excluded.org_id, nome = excluded.nome, ordem = excluded.ordem, cor = excluded.cor
    `;
  }

  for (const item of catalog.orders) {
    const createdAt = atOffset(anchor, -item.daysAgo);
    await tx`
      insert into public.pedido
        (id, org_id, brand_id, cliente_id, provider_order_id, canal, status,
         total, frete, desconto, cancelado_motivo, criado_em, atualizado_em)
      values
        (${item.id}, ${orgId}, ${brands.get(item.brand).id}, ${clients.get(item.client).id},
         ${item.providerOrderId}, ${item.channel}, ${item.status}, ${item.total}, ${item.shipping},
         ${item.discount}, ${item.cancelReason || null}, ${createdAt}, ${createdAt})
      on conflict (id) do update set
        org_id = excluded.org_id, brand_id = excluded.brand_id, cliente_id = excluded.cliente_id,
        provider_order_id = excluded.provider_order_id, canal = excluded.canal, status = excluded.status,
        total = excluded.total, frete = excluded.frete, desconto = excluded.desconto,
        cancelado_motivo = excluded.cancelado_motivo, criado_em = excluded.criado_em,
        atualizado_em = excluded.atualizado_em
    `;
  }

  for (const item of catalog.orderItems) {
    await tx`
      insert into public.pedido_item (id, pedido_id, produto_id, quantidade, preco_unitario)
      values (${item.id}, ${orders.get(item.order).id}, ${products.get(item.product).id}, ${item.quantity}, ${item.unitPrice})
      on conflict (id) do update set
        pedido_id = excluded.pedido_id, produto_id = excluded.produto_id,
        quantidade = excluded.quantidade, preco_unitario = excluded.preco_unitario
    `;
  }

  for (const item of catalog.opportunities) {
    const createdAt = atOffset(anchor, -item.daysAgo);
    await tx`
      insert into public.oportunidade
        (id, org_id, brand_id, cliente_id, etapa_id, responsavel_id, titulo, valor, criado_em, atualizado_em)
      values
        (${item.id}, ${orgId}, ${brands.get(item.brand).id}, ${clients.get(item.client).id},
         ${stages.get(item.stage).id}, ${users.get(item.owner).id}, ${item.title}, ${item.value},
         ${createdAt}, ${createdAt})
      on conflict (id) do update set
        org_id = excluded.org_id, brand_id = excluded.brand_id, cliente_id = excluded.cliente_id,
        etapa_id = excluded.etapa_id, responsavel_id = excluded.responsavel_id,
        titulo = excluded.titulo, valor = excluded.valor, criado_em = excluded.criado_em,
        atualizado_em = excluded.atualizado_em
    `;
  }

  for (const item of catalog.tasks) {
    const dueAt = atOffset(anchor, item.dueDaysFromNow, 15);
    await tx`
      insert into public.tarefa
        (id, org_id, cliente_id, responsavel_id, titulo, descricao, status, vencimento_em, atualizado_em)
      values
        (${item.id}, ${orgId}, ${clients.get(item.client).id}, ${users.get(item.owner).id},
         ${item.title}, ${item.description}, ${item.status}, ${dueAt}, ${anchor})
      on conflict (id) do update set
        org_id = excluded.org_id, cliente_id = excluded.cliente_id,
        responsavel_id = excluded.responsavel_id, titulo = excluded.titulo,
        descricao = excluded.descricao, status = excluded.status,
        vencimento_em = excluded.vencimento_em, atualizado_em = excluded.atualizado_em
    `;
  }

  for (const item of catalog.calendarEvents) {
    const startsAt = atOffset(anchor, item.startsDaysFromNow, 14);
    const endsAt = new Date(startsAt.getTime() + item.durationMinutes * 60_000);
    await tx`
      insert into public.evento_agenda
        (id, org_id, cliente_id, responsavel_id, titulo, inicio, fim)
      values
        (${item.id}, ${orgId}, ${clients.get(item.client).id}, ${users.get(item.owner).id},
         ${item.title}, ${startsAt}, ${endsAt})
      on conflict (id) do update set
        org_id = excluded.org_id, cliente_id = excluded.cliente_id,
        responsavel_id = excluded.responsavel_id, titulo = excluded.titulo,
        inicio = excluded.inicio, fim = excluded.fim
    `;
  }

  for (const item of catalog.conversations) {
    const createdAt = atOffset(anchor, -item.daysAgo);
    await tx`
      insert into public.conversa
        (id, org_id, brand_id, cliente_id, channel_account_id, responsavel_id,
         status, external_id, criado_em, atualizado_em)
      values
        (${item.id}, ${orgId}, ${brands.get(item.brand).id}, ${clients.get(item.client).id},
         ${channels.get(item.channelAccount).id}, ${users.get(item.owner).id}, ${item.status},
         ${item.externalId}, ${createdAt}, ${createdAt})
      on conflict (id) do update set
        org_id = excluded.org_id, brand_id = excluded.brand_id, cliente_id = excluded.cliente_id,
        channel_account_id = excluded.channel_account_id, responsavel_id = excluded.responsavel_id,
        status = excluded.status, external_id = excluded.external_id,
        criado_em = excluded.criado_em, atualizado_em = excluded.atualizado_em
    `;
  }

  for (const item of catalog.messages) {
    const createdAt = atOffset(anchor, -item.daysAgo, item.direction === "entrada" ? 10 : 11);
    await tx`
      insert into public.mensagem
        (id, conversa_id, org_id, direcao, tipo, conteudo, provider_message_id,
         entregue, lida, meta, criado_em)
      values
        (${item.id}, ${conversations.get(item.conversation).id}, ${orgId}, ${item.direction},
         'texto', ${item.content}, ${item.providerMessageId}, ${item.delivered}, ${item.read},
         ${tx.json({ synthetic: true, externalSend: false })}, ${createdAt})
      on conflict (id) do update set
        conversa_id = excluded.conversa_id, org_id = excluded.org_id, direcao = excluded.direcao,
        tipo = excluded.tipo, conteudo = excluded.conteudo,
        provider_message_id = excluded.provider_message_id, entregue = excluded.entregue,
        lida = excluded.lida, meta = excluded.meta, criado_em = excluded.criado_em
    `;
  }

  for (const item of catalog.clientScores) {
    await tx`
      insert into public.score_cliente
        (id, org_id, cliente_id, churn_risk, rfm_recencia, rfm_frequencia, rfm_valor,
         proxima_compra_estimada, explicacao, versao_formula, calculado_em)
      values
        (${item.id}, ${orgId}, ${clients.get(item.client).id}, ${item.churnRisk}, ${item.recency},
         ${item.frequency}, ${item.value}, ${atOffset(anchor, item.nextPurchaseDays)},
         ${item.explanation}, 'synthetic-v1', ${anchor})
      on conflict (id) do update set
        org_id = excluded.org_id, cliente_id = excluded.cliente_id,
        churn_risk = excluded.churn_risk, rfm_recencia = excluded.rfm_recencia,
        rfm_frequencia = excluded.rfm_frequencia, rfm_valor = excluded.rfm_valor,
        proxima_compra_estimada = excluded.proxima_compra_estimada,
        explicacao = excluded.explicacao, versao_formula = excluded.versao_formula,
        calculado_em = excluded.calculado_em
    `;
  }

  for (const item of catalog.productScores) {
    await tx`
      insert into public.score_produto
        (id, org_id, produto_id, risco_encalhe, dias_sem_venda, capital_parado,
         acao_sugerida, versao_formula, calculado_em)
      values
        (${item.id}, ${orgId}, ${products.get(item.product).id}, ${item.stagnationRisk},
         ${item.daysWithoutSale}, ${item.idleCapital}, ${item.suggestedAction}, 'synthetic-v1', ${anchor})
      on conflict (id) do update set
        org_id = excluded.org_id, produto_id = excluded.produto_id,
        risco_encalhe = excluded.risco_encalhe, dias_sem_venda = excluded.dias_sem_venda,
        capital_parado = excluded.capital_parado, acao_sugerida = excluded.acao_sugerida,
        versao_formula = excluded.versao_formula, calculado_em = excluded.calculado_em
    `;
  }

  for (const item of catalog.insights) {
    await tx`
      insert into public.insight
        (id, org_id, tipo, titulo, conteudo, numeros_fonte, confianca, valido_ate,
         modelo_usado, prompt_version, criado_em)
      values
        (${item.id}, ${orgId}, ${item.type}, ${item.title}, ${item.content},
         ${tx.json(item.sourceNumbers)}, ${item.confidence}, ${atOffset(anchor, item.validDays)},
         'synthetic-no-model', 'synthetic-v1', ${anchor})
      on conflict (id) do update set
        org_id = excluded.org_id, tipo = excluded.tipo, titulo = excluded.titulo,
        conteudo = excluded.conteudo, numeros_fonte = excluded.numeros_fonte,
        confianca = excluded.confianca, valido_ate = excluded.valido_ate,
        modelo_usado = excluded.modelo_usado, prompt_version = excluded.prompt_version,
        criado_em = excluded.criado_em
    `;
  }

  const entityIds = new Map([
    ...catalog.clients.map((item) => [item.key, item.id]),
    ...catalog.orders.map((item) => [item.key, item.id]),
  ]);
  for (const item of catalog.auditLogs) {
    await tx`
      insert into public.audit_log
        (id, org_id, brand_id, autor_id, autor_tipo, entidade, entidade_id,
         acao, antes, depois, ip, criado_em)
      values
        (${item.id}, ${orgId}, ${brands.get(item.brand).id}, ${users.get(item.author).id},
         'usuario_sintetico', ${item.entity}, ${entityIds.get(item.entityRef)}, ${item.action},
         null, ${tx.json(item.after)}, null, ${atOffset(anchor, -item.daysAgo)})
      on conflict (id) do nothing
    `;
  }
}
