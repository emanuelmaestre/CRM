import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import postgres from "postgres";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");

loadEnvConfig(process.cwd());

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL não configurada para o teste RLS.");
}

const sql = postgres(process.env.DATABASE_URL, {
  max: 1,
  prepare: false,
  idle_timeout: 5,
  connect_timeout: 10,
});

const PHASE_A_TABLES = [
  "org",
  "brand",
  "app_user",
  "cliente",
  "cliente_identidade",
  "consentimento",
  "tag",
  "cliente_tag",
  "segmento",
  "interacao",
  "produto",
  "produto_canal",
  "estoque_movimento",
  "estoque_saldo",
  "pedido",
  "pedido_item",
  "oportunidade",
  "tarefa",
  "evento_agenda",
  "audit_log",
];

const results = [];

class RollbackOnly extends Error {}
class PolicyUnexpectedlyAllowed extends Error {}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function record(name, evidence) {
  results.push({ name, status: "passed", evidence });
}

function recordFailure(name, evidence) {
  results.push({ name, status: "failed", evidence });
}

async function createFixtures(tx) {
  const orgA = randomUUID();
  const orgB = randomUUID();
  const tagA = randomUUID();
  const tagB = randomUUID();
  const adminA = randomUUID();
  const gestorA = randomUUID();
  const vendedorA = randomUUID();
  const inativoA = randomUUID();
  const vendedorB = randomUUID();

  await tx`
    insert into public.org (id, name, cnpj)
    values
      (${orgA}, 'RLS Test A', ${`rls-a-${randomUUID()}`}),
      (${orgB}, 'RLS Test B', ${`rls-b-${randomUUID()}`})
  `;

  await tx`
    insert into public.tag (id, org_id, nome)
    values
      (${tagA}, ${orgA}, 'RLS Tag A'),
      (${tagB}, ${orgB}, 'RLS Tag B')
  `;

  await tx`
    insert into public.app_user (id, org_id, email, nome, perfil, ativo)
    values
      (${adminA}, ${orgA}, ${`admin-${adminA}@rls.test`}, 'RLS Admin A', 'admin', true),
      (${gestorA}, ${orgA}, ${`gestor-${gestorA}@rls.test`}, 'RLS Gestor A', 'gestor', true),
      (${vendedorA}, ${orgA}, ${`vendedor-${vendedorA}@rls.test`}, 'RLS Vendedor A', 'vendedor', true),
      (${inativoA}, ${orgA}, ${`inativo-${inativoA}@rls.test`}, 'RLS Inativo A', 'vendedor', false),
      (${vendedorB}, ${orgB}, ${`vendedor-${vendedorB}@rls.test`}, 'RLS Vendedor B', 'vendedor', true)
  `;

  return { orgA, orgB, tagA, tagB, adminA, gestorA, vendedorA, inativoA, vendedorB };
}

async function createRelationalFixtures(tx) {
  const fixtures = await createFixtures(tx);
  const brandA = randomUUID();
  const brandB = randomUUID();
  const clientA = randomUUID();
  const clientB = randomUUID();
  const productA = randomUUID();
  const productB = randomUUID();
  const channelA = randomUUID();
  const channelB = randomUUID();
  const orderA = randomUUID();

  await tx`
    insert into public.brand (id, org_id, name, slug)
    values
      (${brandA}, ${fixtures.orgA}, 'RLS Brand A', ${`rls-a-${randomUUID()}`}),
      (${brandB}, ${fixtures.orgB}, 'RLS Brand B', ${`rls-b-${randomUUID()}`})
  `;
  await tx`
    insert into public.channel_account (id, org_id, brand_id, tipo, nome, vault_key)
    values
      (${channelA}, ${fixtures.orgA}, ${brandA}, 'mercadolivre', 'RLS Canal A', ${`rls-a-${randomUUID()}`}),
      (${channelB}, ${fixtures.orgB}, ${brandB}, 'mercadolivre', 'RLS Canal B', ${`rls-b-${randomUUID()}`})
  `;
  await tx`
    insert into public.cliente (id, org_id, nome)
    values
      (${clientA}, ${fixtures.orgA}, 'RLS Cliente A'),
      (${clientB}, ${fixtures.orgB}, 'RLS Cliente B')
  `;
  await tx`
    insert into public.produto (id, org_id, brand_id, sku, nome, custo, preco)
    values
      (${productA}, ${fixtures.orgA}, ${brandA}, ${`RLS-A-${randomUUID()}`}, 'RLS Produto A', 0.40, 1),
      (${productB}, ${fixtures.orgB}, ${brandB}, ${`RLS-B-${randomUUID()}`}, 'RLS Produto B', 0.50, 1)
  `;
  await tx`
    insert into public.pedido (id, org_id, brand_id, cliente_id, canal, total)
    values (${orderA}, ${fixtures.orgA}, ${brandA}, ${clientA}, 'manual', 1)
  `;

  return {
    ...fixtures,
    brandA,
    brandB,
    clientA,
    clientB,
    productA,
    productB,
    channelA,
    channelB,
    orderA,
  };
}

async function assumeRole(tx, role, orgId, userId) {
  await tx.unsafe(`set local role ${role}`);
  if (orgId) {
    await tx`select set_config('app.current_org_id', ${orgId}, true)`;
  }
  if (userId) {
    await tx`select set_config('request.jwt.claim.sub', ${userId}, true)`;
  }
}

async function testWithRollback(name, test) {
  try {
    await sql.begin(async (tx) => {
      await test(tx);
      throw new RollbackOnly();
    });
  } catch (error) {
    if (error instanceof RollbackOnly) return;
    throw new Error(`${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function expectPolicyDenied(name, test) {
  let caught;

  try {
    await sql.begin(async (tx) => {
      await test(tx);
      throw new PolicyUnexpectedlyAllowed();
    });
  } catch (error) {
    caught = error;
  }

  if (caught instanceof PolicyUnexpectedlyAllowed) {
    recordFailure(name, "operação cruzada permitida pela RLS");
    return;
  }

  const code = caught?.code;
  const message = caught instanceof Error ? caught.message : String(caught);
  assert(
    code === "42501" || /row-level security|permission denied/i.test(message),
    `${name}: falhou por motivo inesperado (${code ?? "sem código"}: ${message}).`,
  );

  record(name, `bloqueada pelo Postgres (${code ?? "policy error"})`);
}

async function testMetadata() {
  const tables = await sql`
    select
      c.relname as table_name,
      c.relrowsecurity as rls_enabled,
      c.relforcerowsecurity as rls_forced,
      count(p.policyname)::int as policy_count
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_policies p
      on p.schemaname = n.nspname
      and p.tablename = c.relname
    where n.nspname = 'public'
      and c.relkind = 'r'
    group by c.relname, c.relrowsecurity, c.relforcerowsecurity
    order by c.relname
  `;

  const byName = new Map(tables.map((table) => [table.table_name, table]));
  const disabled = tables.filter((table) => !table.rls_enabled).map((table) => table.table_name);
  const notForced = tables.filter((table) => !table.rls_forced).map((table) => table.table_name);
  const withoutPolicies = tables.filter((table) => table.policy_count === 0).map((table) => table.table_name);
  const missingPhaseATables = PHASE_A_TABLES.filter((table) => !byName.has(table));

  assert(disabled.length === 0, `Tabelas sem RLS: ${disabled.join(", ")}`);
  assert(notForced.length === 0, `Tabelas sem FORCE RLS: ${notForced.join(", ")}`);
  assert(withoutPolicies.length === 0, `Tabelas sem policies: ${withoutPolicies.join(", ")}`);
  assert(missingPhaseATables.length === 0, `Tabelas da Fase A ausentes: ${missingPhaseATables.join(", ")}`);

  record(
    "metadados RLS",
    `${tables.length} tabelas públicas protegidas; ${tables.reduce((sum, table) => sum + table.policy_count, 0)} policies`,
  );
}

async function testProfileMetadata() {
  const activePolicies = await sql`
    select count(*)::int as total
    from pg_policies
    where schemaname = 'public'
      and policyname like 'rls_active_profile_%'
      and permissive = 'RESTRICTIVE'
  `;
  const sensitivePolicies = await sql`
    select count(*)::int as total
    from pg_policies
    where schemaname = 'public'
      and policyname like 'rls_profile_%'
      and permissive = 'RESTRICTIVE'
  `;
  const costPrivilege = await sql`
    select has_column_privilege('authenticated', 'public.produto', 'custo', 'SELECT') as allowed
  `;
  const functions = await sql`
    select count(*)::int as total
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('current_app_user_id', 'current_app_profile', 'listar_produtos_financeiros')
  `;

  assert(activePolicies[0].total >= PHASE_A_TABLES.length, "Policies de identidade ativa incompletas.");
  assert(sensitivePolicies[0].total >= 10, "Policies restritivas por perfil incompletas.");
  assert(costPrivilege[0].allowed === false, "authenticated ainda possui SELECT direto em produto.custo.");
  assert(functions[0].total === 3, "Funções auxiliares de RLS ausentes.");
  record(
    "metadados RLS por perfil",
    `${activePolicies[0].total} policies de identidade; ${sensitivePolicies[0].total} policies por perfil; custo revogado`,
  );
}

async function testDefaultDeny() {
  await testWithRollback("default deny sem tenant", async (tx) => {
    await createFixtures(tx);
    await assumeRole(tx, "authenticated");

    const visible = await tx`select id from public.org`;
    assert(visible.length === 0, `Role sem tenant visualizou ${visible.length} organizações.`);
    record("default deny sem tenant", "0 organizações visíveis");
  });
}

async function testInactiveUserDenied() {
  await testWithRollback("usuário inativo sem acesso", async (tx) => {
    const fixtures = await createFixtures(tx);
    await assumeRole(tx, "authenticated", fixtures.orgA, fixtures.inativoA);
    const visible = await tx`select id from public.tag`;
    assert(visible.length === 0, "Usuário inativo visualizou dados da organização.");
    record("usuário inativo sem acesso", "0 linhas visíveis");
  });
}

async function testReadIsolation() {
  await testWithRollback("isolamento de leitura", async (tx) => {
    const fixtures = await createFixtures(tx);
    await assumeRole(tx, "authenticated", fixtures.orgA, fixtures.adminA);

    const orgs = await tx`select id from public.org order by id`;
    const tags = await tx`select id, org_id from public.tag order by id`;

    assert(orgs.length === 1 && orgs[0].id === fixtures.orgA, "Leitura de org cruzou tenants.");
    assert(tags.length === 1 && tags[0].org_id === fixtures.orgA, "Leitura de tag cruzou tenants.");
    record("isolamento de leitura", "tenant A vê somente org/tag do tenant A");
  });
}

async function testOwnTenantWrites() {
  await testWithRollback("escrita no próprio tenant", async (tx) => {
    const fixtures = await createFixtures(tx);
    await assumeRole(tx, "authenticated", fixtures.orgA, fixtures.adminA);

    const inserted = await tx`
      insert into public.tag (org_id, nome)
      values (${fixtures.orgA}, 'RLS Own Insert')
      returning id
    `;
    const updated = await tx`
      update public.tag set nome = 'RLS Own Update'
      where id = ${fixtures.tagA}
      returning id
    `;
    const deleted = await tx`
      delete from public.tag
      where id = ${fixtures.tagA}
      returning id
    `;

    assert(inserted.length === 1, "INSERT no próprio tenant não foi permitido.");
    assert(updated.length === 1, "UPDATE no próprio tenant não foi permitido.");
    assert(deleted.length === 1, "DELETE no próprio tenant não foi permitido.");
    record("escrita no próprio tenant", "INSERT, UPDATE e DELETE permitidos");
  });
}

async function testForeignRowsInvisibleToMutations() {
  await testWithRollback("mutações não enxergam outro tenant", async (tx) => {
    const fixtures = await createFixtures(tx);
    await assumeRole(tx, "authenticated", fixtures.orgA, fixtures.adminA);

    const updated = await tx`
      update public.tag set nome = 'RLS Foreign Update'
      where id = ${fixtures.tagB}
      returning id
    `;
    const deleted = await tx`
      delete from public.tag
      where id = ${fixtures.tagB}
      returning id
    `;

    assert(updated.length === 0, "UPDATE alcançou linha de outro tenant.");
    assert(deleted.length === 0, "DELETE alcançou linha de outro tenant.");
    record("mutações não enxergam outro tenant", "UPDATE e DELETE afetaram 0 linhas");
  });
}

async function testForeignInsertDenied() {
  await expectPolicyDenied("INSERT cruzado", async (tx) => {
    const fixtures = await createFixtures(tx);
    await assumeRole(tx, "authenticated", fixtures.orgA, fixtures.adminA);
    await tx`
      insert into public.tag (org_id, nome)
      values (${fixtures.orgB}, 'RLS Foreign Insert')
    `;
  });
}

async function testTenantMoveDenied() {
  await expectPolicyDenied("UPDATE movendo linha para outro tenant", async (tx) => {
    const fixtures = await createFixtures(tx);
    await assumeRole(tx, "authenticated", fixtures.orgA, fixtures.adminA);
    await tx`
      update public.tag
      set org_id = ${fixtures.orgB}
      where id = ${fixtures.tagA}
    `;
  });
}

async function testAuditIsAppendOnlyForApplicationRole() {
  await testWithRollback("auditoria somente leitura para authenticated", async (tx) => {
    const fixtures = await createFixtures(tx);
    const auditId = randomUUID();
    await tx`
      insert into public.audit_log (
        id, org_id, entidade, entidade_id, acao, depois
      ) values (
        ${auditId}, ${fixtures.orgA}, 'rls_test', ${fixtures.tagA}, 'teste', ${JSON.stringify({ ok: true })}::jsonb
      )
    `;

    await assumeRole(tx, "authenticated", fixtures.orgA, fixtures.adminA);
    const visible = await tx`select id from public.audit_log where id = ${auditId}`;
    const updated = await tx`
      update public.audit_log set acao = 'alterado'
      where id = ${auditId}
      returning id
    `;
    const deleted = await tx`
      delete from public.audit_log
      where id = ${auditId}
      returning id
    `;

    assert(visible.length === 1, "Registro de auditoria do tenant não ficou visível.");
    assert(updated.length === 0, "Role authenticated alterou audit_log.");
    assert(deleted.length === 0, "Role authenticated removeu audit_log.");
    record("auditoria somente leitura para authenticated", "SELECT permitido; UPDATE/DELETE afetaram 0 linhas");
  });
}

async function testAuditInsertDenied() {
  await expectPolicyDenied("INSERT direto em auditoria", async (tx) => {
    const fixtures = await createFixtures(tx);
    await assumeRole(tx, "authenticated", fixtures.orgA, fixtures.adminA);
    await tx`
      insert into public.audit_log (
        org_id, entidade, entidade_id, acao
      ) values (
        ${fixtures.orgA}, 'rls_test', ${fixtures.tagA}, 'insercao_indevida'
      )
    `;
  });
}

async function testCrossTenantClientTagDenied() {
  await expectPolicyDenied("cliente_tag entre tenants", async (tx) => {
    const fixtures = await createRelationalFixtures(tx);
    await assumeRole(tx, "authenticated", fixtures.orgA, fixtures.adminA);
    await tx`
      insert into public.cliente_tag (cliente_id, tag_id)
      values (${fixtures.clientA}, ${fixtures.tagB})
    `;
  });
}

async function testCrossTenantOrderItemDenied() {
  await expectPolicyDenied("pedido_item entre tenants", async (tx) => {
    const fixtures = await createRelationalFixtures(tx);
    await assumeRole(tx, "authenticated", fixtures.orgA, fixtures.adminA);
    await tx`
      insert into public.pedido_item (pedido_id, produto_id, quantidade, preco_unitario)
      values (${fixtures.orderA}, ${fixtures.productB}, 1, 1)
    `;
  });
}

async function testCrossTenantStockMovementDenied() {
  await expectPolicyDenied("estoque_movimento com produto de outro tenant", async (tx) => {
    const fixtures = await createRelationalFixtures(tx);
    await assumeRole(tx, "authenticated", fixtures.orgA, fixtures.adminA);
    await tx`
      insert into public.estoque_movimento (org_id, produto_id, tipo, quantidade)
      values (${fixtures.orgA}, ${fixtures.productB}, 'entrada', 1)
    `;
  });
}

async function testCrossTenantProductChannelDenied() {
  await expectPolicyDenied("produto_canal entre tenants", async (tx) => {
    const fixtures = await createRelationalFixtures(tx);
    await assumeRole(tx, "authenticated", fixtures.orgA, fixtures.adminA);
    await tx`
      insert into public.produto_canal (
        org_id, produto_id, channel_account_id, external_listing_id
      ) values (
        ${fixtures.orgA}, ${fixtures.productA}, ${fixtures.channelB}, ${`rls-${randomUUID()}`}
      )
    `;
  });
}

async function testProfileUserVisibility() {
  await testWithRollback("visibilidade de usuários por perfil", async (tx) => {
    const fixtures = await createFixtures(tx);
    await assumeRole(tx, "authenticated", fixtures.orgA, fixtures.vendedorA);

    const visible = await tx`select id, perfil from public.app_user order by id`;
    assert(visible.length === 1, `Vendedor visualizou ${visible.length} usuários.`);
    assert(visible[0].id === fixtures.vendedorA, "Vendedor visualizou outro usuário.");
    record("visibilidade de usuários por perfil", "vendedor vê somente o próprio cadastro");
  });

  await testWithRollback("gestor consulta equipe", async (tx) => {
    const fixtures = await createFixtures(tx);
    await assumeRole(tx, "authenticated", fixtures.orgA, fixtures.gestorA);

    const visible = await tx`select id from public.app_user`;
    assert(visible.length === 4, `Gestor visualizou ${visible.length} de 4 usuários da equipe.`);
    record("gestor consulta equipe", "4 usuários da própria organização visíveis");
  });
}

async function testOnlyAdminManagesUsers() {
  await testWithRollback("gestor não administra usuários", async (tx) => {
    const fixtures = await createFixtures(tx);
    await assumeRole(tx, "authenticated", fixtures.orgA, fixtures.gestorA);

    const updated = await tx`
      update public.app_user
      set perfil = 'gestor'
      where id = ${fixtures.vendedorA}
      returning id
    `;
    assert(updated.length === 0, "Gestor alterou o perfil de um usuário.");
    record("gestor não administra usuários", "UPDATE afetou 0 linhas");
  });

  await testWithRollback("admin administra usuários", async (tx) => {
    const fixtures = await createFixtures(tx);
    await assumeRole(tx, "authenticated", fixtures.orgA, fixtures.adminA);

    const updated = await tx`
      update public.app_user
      set perfil = 'gestor'
      where id = ${fixtures.vendedorA}
      returning id
    `;
    assert(updated.length === 1, "Admin não conseguiu alterar o perfil de um usuário.");
    record("admin administra usuários", "UPDATE de perfil permitido");
  });
}

async function testOnlyAdminManagesOrganization() {
  await testWithRollback("vendedor não altera organização", async (tx) => {
    const fixtures = await createFixtures(tx);
    await assumeRole(tx, "authenticated", fixtures.orgA, fixtures.vendedorA);

    const updated = await tx`
      update public.org
      set name = 'Alteração indevida'
      where id = ${fixtures.orgA}
      returning id
    `;
    assert(updated.length === 0, "Vendedor alterou a organização.");
    record("vendedor não altera organização", "UPDATE afetou 0 linhas");
  });

  await testWithRollback("admin altera organização", async (tx) => {
    const fixtures = await createFixtures(tx);
    await assumeRole(tx, "authenticated", fixtures.orgA, fixtures.adminA);

    const updated = await tx`
      update public.org
      set name = 'RLS Organização Atualizada'
      where id = ${fixtures.orgA}
      returning id
    `;
    assert(updated.length === 1, "Admin não conseguiu alterar a organização.");
    record("admin altera organização", "UPDATE permitido no próprio tenant");
  });
}

async function testProductCostConfidentiality() {
  await testWithRollback("vendedor consulta produto sem custo", async (tx) => {
    const fixtures = await createRelationalFixtures(tx);
    await assumeRole(tx, "authenticated", fixtures.orgA, fixtures.vendedorA);

    const visible = await tx`select id, sku, nome, preco from public.produto`;
    assert(visible.length === 1 && visible[0].id === fixtures.productA, "Produto do tenant não ficou visível.");
    const financial = await tx`select * from public.listar_produtos_financeiros()`;
    assert(financial.length === 0, "Função financeira expôs custo ao vendedor.");
    record("vendedor consulta produto sem custo", "catálogo visível; função financeira retornou 0 linhas");
  });

  await expectPolicyDenied("vendedor não lê produto.custo", async (tx) => {
    const fixtures = await createRelationalFixtures(tx);
    await assumeRole(tx, "authenticated", fixtures.orgA, fixtures.vendedorA);
    await tx`select custo from public.produto where id = ${fixtures.productA}`;
  });

  await testWithRollback("gestor consulta custo por acesso controlado", async (tx) => {
    const fixtures = await createRelationalFixtures(tx);
    await assumeRole(tx, "authenticated", fixtures.orgA, fixtures.gestorA);

    const financial = await tx`select * from public.listar_produtos_financeiros()`;
    assert(financial.length === 1, "Gestor não recebeu o produto financeiro do tenant.");
    assert(
      financial[0].id === fixtures.productA && Number(financial[0].custo) === 0.4,
      "Custo incorreto ou tenant cruzado.",
    );
    record("gestor consulta custo por acesso controlado", "1 produto financeiro da própria organização");
  });
}

async function testStockMutationByProfile() {
  await expectPolicyDenied("vendedor não movimenta estoque", async (tx) => {
    const fixtures = await createRelationalFixtures(tx);
    await assumeRole(tx, "authenticated", fixtures.orgA, fixtures.vendedorA);
    await tx`
      insert into public.estoque_movimento (org_id, produto_id, tipo, quantidade)
      values (${fixtures.orgA}, ${fixtures.productA}, 'entrada', 1)
    `;
  });

  await testWithRollback("gestor movimenta estoque", async (tx) => {
    const fixtures = await createRelationalFixtures(tx);
    await assumeRole(tx, "authenticated", fixtures.orgA, fixtures.gestorA);
    const inserted = await tx`
      insert into public.estoque_movimento (org_id, produto_id, tipo, quantidade)
      values (${fixtures.orgA}, ${fixtures.productA}, 'entrada', 1)
      returning id
    `;
    assert(inserted.length === 1, "Gestor não conseguiu movimentar estoque.");
    record("gestor movimenta estoque", "INSERT permitido no próprio tenant");
  });
}

try {
  await testMetadata();
  await testProfileMetadata();
  await testDefaultDeny();
  await testInactiveUserDenied();
  await testReadIsolation();
  await testOwnTenantWrites();
  await testForeignRowsInvisibleToMutations();
  await testForeignInsertDenied();
  await testTenantMoveDenied();
  await testAuditIsAppendOnlyForApplicationRole();
  await testAuditInsertDenied();
  await testCrossTenantClientTagDenied();
  await testCrossTenantOrderItemDenied();
  await testCrossTenantStockMovementDenied();
  await testCrossTenantProductChannelDenied();
  await testProfileUserVisibility();
  await testOnlyAdminManagesUsers();
  await testOnlyAdminManagesOrganization();
  await testProductCostConfidentiality();
  await testStockMutationByProfile();

  const failed = results.filter((result) => result.status === "failed");
  console.log(JSON.stringify({ status: failed.length === 0 ? "passed" : "failed", tests: results }, null, 2));
  if (failed.length > 0) process.exitCode = 1;
} finally {
  await sql.end({ timeout: 2 });
}
