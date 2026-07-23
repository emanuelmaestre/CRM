import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { avaliarGates, type GateInput } from "@/modules/reguas/domain/gates";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL é obrigatória para o teste integrado dos gates.");
const sql = postgres(databaseUrl, { max: 1, prepare: false });
const ids = {
  org: randomUUID(),
  brand: randomUUID(),
  cliente: randomUUID(),
  template: randomUUID(),
  templatePendente: randomUUID(),
  regua: randomUUID(),
  reguaOutra: randomUUID(),
};
process.env.DEFAULT_ORG_ID ??= ids.org;
const horarioComercial = new Date("2026-07-20T12:00:00Z"); // segunda, 09h em São Paulo

function input(overrides: Partial<GateInput> = {}): GateInput {
  return {
    orgId: ids.org,
    reguaId: ids.regua,
    clienteId: ids.cliente,
    brandId: ids.brand,
    finalidade: "marketing",
    canal: "whatsapp",
    canalOrigem: "whatsapp",
    idempotencyKey: `gate-test-${randomUUID()}`,
    templateId: ids.template,
    cooldownHoras: 24,
    limiteDiarioCliente: 1,
    horaAtual: horarioComercial,
    ...overrides,
  };
}

beforeAll(async () => {
  await sql`insert into public.org (id, name, cnpj) values (${ids.org}, 'Gates Fase B', ${`test-${ids.org}`})`;
  await sql`insert into public.brand (id, org_id, name, slug) values (${ids.brand}, ${ids.org}, 'Marca gates', 'karzi')`;
  await sql`insert into public.cliente (id, org_id, nome) values (${ids.cliente}, ${ids.org}, 'Cliente gates')`;
  await sql`
    insert into public.template_mensagem (id, org_id, brand_id, nome, canal, conteudo, aprovado)
    values
      (${ids.template}, ${ids.org}, ${ids.brand}, 'Template aprovado', 'whatsapp', 'Olá', 'true'),
      (${ids.templatePendente}, ${ids.org}, ${ids.brand}, 'Template pendente', 'whatsapp', 'Olá', 'false')
  `;
  await sql`
    insert into public.regua (id, org_id, brand_id, nome, gatilho, template_id, canal, cooldown_horas, limite_diario_cliente)
    values
      (${ids.regua}, ${ids.org}, ${ids.brand}, 'Régua principal', 'manual', ${ids.template}, 'whatsapp', 24, 1),
      (${ids.reguaOutra}, ${ids.org}, ${ids.brand}, 'Régua secundária', 'manual', ${ids.template}, 'whatsapp', 0, 1)
  `;
});

afterAll(async () => {
  await sql`delete from public.regua_execucao where org_id = ${ids.org}`;
  await sql`delete from public.consentimento where org_id = ${ids.org}`;
  await sql`delete from public.regua where org_id = ${ids.org}`;
  await sql`delete from public.template_mensagem where org_id = ${ids.org}`;
  await sql`delete from public.cliente where org_id = ${ids.org}`;
  await sql`delete from public.brand where org_id = ${ids.org}`;
  await sql`delete from public.org where id = ${ids.org}`;
  await sql.end({ timeout: 2 });
});

describe.sequential("seis gates operacionais da Fase B", () => {
  it("Gate 1 bloqueia sem opt-in", async () => {
    expect(await avaliarGates(input())).toMatchObject({ aprovado: false, gateBloqueado: "gate_1" });
    await sql`
      insert into public.consentimento (cliente_id, org_id, brand_id, finalidade, canal, origem)
      values (${ids.cliente}, ${ids.org}, ${ids.brand}, 'marketing', 'whatsapp', 'teste_integrado')
    `;
  });

  it("Gate 2 mantém cliente de marketplace no canal de origem", async () => {
    expect(await avaliarGates(input({ canalOrigem: "mercadolivre" }))).toMatchObject({ aprovado: false, gateBloqueado: "gate_2" });
  });

  it("Gates 3 e 6 validam marca/canal e aprovação do template", async () => {
    expect(await avaliarGates(input({ templateId: randomUUID() }))).toMatchObject({ aprovado: false, gateBloqueado: "gate_3" });
    expect(await avaliarGates(input({ templateId: ids.templatePendente }))).toMatchObject({ aprovado: false, gateBloqueado: "gate_6" });
  });

  it("aprova o fluxo válido dentro da janela", async () => {
    expect(await avaliarGates(input())).toEqual({ aprovado: true });
  });

  it("Gate 4 bloqueia chave repetida e cooldown", async () => {
    const chave = `exact-${randomUUID()}`;
    await sql`
      insert into public.regua_execucao (org_id, regua_id, cliente_id, idempotency_key, status, criado_em)
      values (${ids.org}, ${ids.regua}, ${ids.cliente}, ${chave}, 'enviada', ${horarioComercial})
    `;
    expect(await avaliarGates(input({ idempotencyKey: chave }))).toMatchObject({ aprovado: false, gateBloqueado: "gate_4" });
    expect(await avaliarGates(input())).toMatchObject({ aprovado: false, gateBloqueado: "gate_4" });
    await sql`delete from public.regua_execucao where org_id = ${ids.org}`;
  });

  it("Gate 5 bloqueia fora da janela e ao atingir o limite diário", async () => {
    expect(await avaliarGates(input({ horaAtual: new Date("2026-07-25T13:00:00Z") }))).toMatchObject({ aprovado: false, gateBloqueado: "gate_5" });
    await sql`
      insert into public.regua_execucao (org_id, regua_id, cliente_id, idempotency_key, status, criado_em)
      values (${ids.org}, ${ids.reguaOutra}, ${ids.cliente}, ${`daily-${randomUUID()}`}, 'enviada', ${horarioComercial})
    `;
    expect(await avaliarGates(input({ cooldownHoras: 0 }))).toMatchObject({ aprovado: false, gateBloqueado: "gate_5" });
  });
});
