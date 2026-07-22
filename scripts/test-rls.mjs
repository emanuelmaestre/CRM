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

async function createFixtures(tx) {
  const orgA = randomUUID();
  const orgB = randomUUID();
  const tagA = randomUUID();
  const tagB = randomUUID();

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

  return { orgA, orgB, tagA, tagB };
}

async function assumeRole(tx, role, orgId) {
  await tx.unsafe(`set local role ${role}`);
  if (orgId) {
    await tx`select set_config('app.current_org_id', ${orgId}, true)`;
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
    throw new Error(`${name}: a operação cruzada foi permitida pela RLS.`);
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
      count(p.policyname)::int as policy_count
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_policies p
      on p.schemaname = n.nspname
      and p.tablename = c.relname
    where n.nspname = 'public'
      and c.relkind = 'r'
    group by c.relname, c.relrowsecurity
    order by c.relname
  `;

  const byName = new Map(tables.map((table) => [table.table_name, table]));
  const disabled = tables.filter((table) => !table.rls_enabled).map((table) => table.table_name);
  const withoutPolicies = tables.filter((table) => table.policy_count === 0).map((table) => table.table_name);
  const missingPhaseATables = PHASE_A_TABLES.filter((table) => !byName.has(table));

  assert(disabled.length === 0, `Tabelas sem RLS: ${disabled.join(", ")}`);
  assert(withoutPolicies.length === 0, `Tabelas sem policies: ${withoutPolicies.join(", ")}`);
  assert(missingPhaseATables.length === 0, `Tabelas da Fase A ausentes: ${missingPhaseATables.join(", ")}`);

  record(
    "metadados RLS",
    `${tables.length} tabelas públicas protegidas; ${tables.reduce((sum, table) => sum + table.policy_count, 0)} policies`,
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

async function testReadIsolation() {
  await testWithRollback("isolamento de leitura", async (tx) => {
    const fixtures = await createFixtures(tx);
    await assumeRole(tx, "authenticated", fixtures.orgA);

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
    await assumeRole(tx, "authenticated", fixtures.orgA);

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
    await assumeRole(tx, "authenticated", fixtures.orgA);

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
    await assumeRole(tx, "authenticated", fixtures.orgA);
    await tx`
      insert into public.tag (org_id, nome)
      values (${fixtures.orgB}, 'RLS Foreign Insert')
    `;
  });
}

async function testTenantMoveDenied() {
  await expectPolicyDenied("UPDATE movendo linha para outro tenant", async (tx) => {
    const fixtures = await createFixtures(tx);
    await assumeRole(tx, "authenticated", fixtures.orgA);
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

    await assumeRole(tx, "authenticated", fixtures.orgA);
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
    await assumeRole(tx, "authenticated", fixtures.orgA);
    await tx`
      insert into public.audit_log (
        org_id, entidade, entidade_id, acao
      ) values (
        ${fixtures.orgA}, 'rls_test', ${fixtures.tagA}, 'insercao_indevida'
      )
    `;
  });
}

try {
  await testMetadata();
  await testDefaultDeny();
  await testReadIsolation();
  await testOwnTenantWrites();
  await testForeignRowsInvisibleToMutations();
  await testForeignInsertDenied();
  await testTenantMoveDenied();
  await testAuditIsAppendOnlyForApplicationRole();
  await testAuditInsertDenied();

  console.log(JSON.stringify({ status: "passed", tests: results }, null, 2));
} finally {
  await sql.end({ timeout: 2 });
}
