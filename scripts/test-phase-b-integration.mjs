import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import postgres from "postgres";
import { resolveDatabaseConnectionString } from "./database-url.mjs";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");
loadEnvConfig(process.cwd());

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL não configurada para os testes integrados da Fase B.");
}

const sql = postgres(resolveDatabaseConnectionString(process.env.DATABASE_URL), {
  max: 10,
  prepare: false,
  connect_timeout: 10,
});

const ids = {
  org: randomUUID(),
  brand: randomUUID(),
  brandB: randomUUID(),
  cliente: randomUUID(),
  contaA: randomUUID(),
  contaB: randomUUID(),
  conversa: randomUUID(),
  produto: randomUUID(),
  saldo: randomUUID(),
  referencia: randomUUID(),
  orgExterna: randomUUID(),
  brandExterna: randomUUID(),
  contaExterna: randomUUID(),
};
const providerOrderId = `stress-order-${randomUUID()}`;
const providerMessageId = `stress-message-${randomUUID()}`;

async function limparFixtures() {
  await sql`delete from public.mensagem where conversa_id = ${ids.conversa}`;
  await sql`delete from public.conversa where id = ${ids.conversa}`;
  await sql`delete from public.pedido where org_id = ${ids.org}`;
  await sql`delete from public.estoque_movimento where org_id = ${ids.org}`;
  await sql`delete from public.estoque_saldo where id = ${ids.saldo}`;
  await sql`delete from public.produto where id = ${ids.produto}`;
  await sql`delete from public.channel_account where id in (${ids.contaA}, ${ids.contaB})`;
  await sql`delete from public.channel_account where id = ${ids.contaExterna}`;
  await sql`delete from public.cliente where id = ${ids.cliente}`;
  await sql`delete from public.brand where id = ${ids.brand}`;
  await sql`delete from public.brand where id = ${ids.brandB}`;
  await sql`delete from public.org where id = ${ids.org}`;
  await sql`delete from public.brand where id = ${ids.brandExterna}`;
  await sql`delete from public.org where id = ${ids.orgExterna}`;
}

try {
  const indexes = await sql`
    select indexname
    from pg_indexes
    where schemaname = 'public'
      and indexname in (
        'uq_pedido_org_account_provider',
        'uq_pedido_org_canal_provider_legacy',
        'uq_mensagem_org_provider',
        'uq_movimento_referencia',
        'idx_pedido_recebido',
        'idx_evento_dominio_pendente'
      )
  `;
  assert.equal(indexes.length, 6, "Os índices de idempotência, SLA e recuperação da Fase B devem existir.");

  const [deliveryColumns] = await sql`
    select count(*)::int as total
    from information_schema.columns
    where table_schema = 'public' and table_name = 'pedido'
      and column_name = 'recebido_em'
  `;
  assert.equal(deliveryColumns.total, 1, "Pedido deve registrar o instante de recebimento para medir o SLA.");

  const [reguaColumns] = await sql`
    select count(*)::int as total
    from information_schema.columns
    where table_schema = 'public' and table_name = 'regua'
      and column_name in ('cooldown_horas', 'limite_diario_cliente')
  `;
  assert.equal(reguaColumns.total, 2, "Cooldown e limite diário devem existir em regua.");
  const [mappingColumns] = await sql`
    select count(*)::int as total
    from information_schema.columns
    where table_schema = 'public' and table_name = 'produto_canal'
      and column_name in ('external_sku_id', 'external_warehouse_id')
  `;
  assert.equal(mappingColumns.total, 2, "O mapeamento deve suportar SKU e warehouse externos.");

  await sql`
    insert into public.org (id, name, cnpj)
    values (${ids.org}, 'Fase B Integration Test', ${`test-${ids.org}`})
  `;
  await sql`
    insert into public.brand (id, org_id, name, slug)
    values
      (${ids.brand}, ${ids.org}, 'Marca de teste A', ${`fase-b-a-${ids.brand}`}),
      (${ids.brandB}, ${ids.org}, 'Marca de teste B', ${`fase-b-b-${ids.brandB}`})
  `;
  await sql`
    insert into public.cliente (id, org_id, nome)
    values (${ids.cliente}, ${ids.org}, 'Cliente de teste da Fase B')
  `;
  await sql`
    insert into public.channel_account (id, org_id, brand_id, tipo, nome, status, vault_key)
    values
      (${ids.contaA}, ${ids.org}, ${ids.brand}, 'mercadolivre', 'Conta A', 'desconectado', ${`test/${ids.contaA}`}),
      (${ids.contaB}, ${ids.org}, ${ids.brandB}, 'mercadolivre', 'Conta B', 'desconectado', ${`test/${ids.contaB}`})
  `;
  await sql`
    insert into public.org (id, name, cnpj)
    values (${ids.orgExterna}, 'Tenant externo da Fase B', ${`test-${ids.orgExterna}`})
  `;
  await sql`
    insert into public.brand (id, org_id, name, slug)
    values (${ids.brandExterna}, ${ids.orgExterna}, 'Marca externa', 'wuwu')
  `;
  await sql`
    insert into public.channel_account (id, org_id, brand_id, tipo, nome, status, vault_key)
    values (${ids.contaExterna}, ${ids.orgExterna}, ${ids.brandExterna}, 'mercadolivre', 'Conta externa', 'desconectado', ${`test/${ids.contaExterna}`})
  `;

  await sql`
    insert into public.pedido (org_id, brand_id, channel_account_id, cliente_id, provider_order_id, canal, total)
    values
      (${ids.org}, ${ids.brand}, ${ids.contaA}, ${ids.cliente}, ${providerOrderId}, 'mercadolivre', 10),
      (${ids.org}, ${ids.brandB}, ${ids.contaB}, ${ids.cliente}, ${providerOrderId}, 'mercadolivre', 10)
  `;
  const [ordersByAccount] = await sql`
    select count(*)::int as total from public.pedido
    where org_id = ${ids.org} and provider_order_id = ${providerOrderId}
  `;
  assert.equal(ordersByAccount.total, 2, "O mesmo ID externo deve ser isolado por conta do canal.");

  await assert.rejects(
    sql`
      insert into public.pedido (org_id, brand_id, channel_account_id, cliente_id, provider_order_id, canal, total)
      values (${ids.org}, ${ids.brand}, ${ids.contaExterna}, ${ids.cliente}, ${`cross-${randomUUID()}`}, 'mercadolivre', 10)
    `,
    (error) => error?.code === "23503",
    "Pedido não pode referenciar conta de canal de outro tenant.",
  );

  await assert.rejects(
    sql`
      insert into public.pedido (org_id, brand_id, channel_account_id, cliente_id, provider_order_id, canal, total)
      values (${ids.org}, ${ids.brand}, ${ids.contaA}, ${ids.cliente}, ${providerOrderId}, 'mercadolivre', 10)
    `,
    (error) => error?.code === "23505",
    "A mesma conta não pode ingerir o mesmo pedido duas vezes.",
  );

  const legacyOrderId = `legacy-${randomUUID()}`;
  await sql`
    insert into public.pedido (org_id, brand_id, cliente_id, provider_order_id, canal, total)
    values (${ids.org}, ${ids.brand}, ${ids.cliente}, ${legacyOrderId}, 'shopee', 10)
  `;
  await assert.rejects(
    sql`
      insert into public.pedido (org_id, brand_id, cliente_id, provider_order_id, canal, total)
      values (${ids.org}, ${ids.brand}, ${ids.cliente}, ${legacyOrderId}, 'shopee', 10)
    `,
    (error) => error?.code === "23505",
    "Registros legados também devem permanecer idempotentes.",
  );

  await sql`
    insert into public.conversa (id, org_id, brand_id, cliente_id, channel_account_id, external_id)
    values (${ids.conversa}, ${ids.org}, ${ids.brand}, ${ids.cliente}, ${ids.contaA}, ${`thread-${ids.conversa}`})
  `;
  const mensagens = await Promise.all(
    Array.from({ length: 50 }, () => sql`
      insert into public.mensagem (conversa_id, org_id, direcao, conteudo, provider_message_id)
      values (${ids.conversa}, ${ids.org}, 'entrada', 'Mensagem concorrente', ${providerMessageId})
      on conflict do nothing
      returning id
    `),
  );
  assert.equal(mensagens.flat().length, 1, "Somente uma inserção concorrente de mensagem deve vencer.");
  const [messageCount] = await sql`
    select count(*)::int as total from public.mensagem
    where org_id = ${ids.org} and provider_message_id = ${providerMessageId}
  `;
  assert.equal(messageCount.total, 1, "O teste de estresse não pode deixar mensagens duplicadas.");

  await sql`
    insert into public.produto (id, org_id, brand_id, sku, nome, preco)
    values (${ids.produto}, ${ids.org}, ${ids.brand}, ${`SKU-${ids.produto}`}, 'Produto de teste', 10)
  `;
  await sql`
    insert into public.estoque_saldo (id, org_id, produto_id, saldo)
    values (${ids.saldo}, ${ids.org}, ${ids.produto}, 100)
  `;
  const movimentos = await Promise.all(
    Array.from({ length: 50 }, () => sql`
      insert into public.estoque_movimento (
        org_id, produto_id, tipo, quantidade, referencia_id, referencia_tipo
      ) values (
        ${ids.org}, ${ids.produto}, 'saida', 1, ${ids.referencia}, 'pedido_item'
      )
      on conflict do nothing
      returning id
    `),
  );
  assert.equal(movimentos.flat().length, 1, "A baixa concorrente de estoque deve gerar um único movimento.");

  console.log(JSON.stringify({
    status: "passed",
    assertions: {
      accountScopedOrders: 2,
      duplicateMessagesAfter50ConcurrentAttempts: messageCount.total,
      stockMovementsAfter50ConcurrentAttempts: movimentos.flat().length,
      automationLimitsPresent: true,
      deliverySlaTracePresent: true,
      eventOutboxRecoveryIndexPresent: true,
    },
  }, null, 2));
} finally {
  try {
    await limparFixtures();
  } finally {
    await sql.end({ timeout: 5 });
  }
}
