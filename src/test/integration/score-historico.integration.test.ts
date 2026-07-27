import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recalcularScoreCliente, obterHistoricoScore } from "@/modules/scoring/application/scoring.service";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL é obrigatória para o teste integrado de histórico de score.");
const sql = postgres(databaseUrl, { max: 1, prepare: false });

const ids = {
  org: randomUUID(),
  brand: randomUUID(),
  cliente: randomUUID(),
  pedido1: randomUUID(),
  pedido2: randomUUID(),
};
process.env.DEFAULT_ORG_ID ??= ids.org;

beforeAll(async () => {
  await sql`insert into public.org (id, name, cnpj) values (${ids.org}, 'Score Historico', ${`test-${ids.org}`})`;
  await sql`insert into public.brand (id, org_id, name, slug) values (${ids.brand}, ${ids.org}, 'Marca score', 'karzi')`;
  await sql`insert into public.cliente (id, org_id, nome) values (${ids.cliente}, ${ids.org}, 'Cliente score')`;
});

afterAll(async () => {
  await sql`delete from public.score_historico where org_id = ${ids.org}`;
  await sql`delete from public.score_cliente where org_id = ${ids.org}`;
  await sql`delete from public.evento_dominio where org_id = ${ids.org}`;
  await sql`delete from public.pedido where org_id = ${ids.org}`;
  await sql`delete from public.cliente where org_id = ${ids.org}`;
  await sql`delete from public.brand where org_id = ${ids.org}`;
  await sql`delete from public.org where id = ${ids.org}`;
  await sql.end();
});

describe.sequential("histórico de score — série temporal", () => {
  it("grava uma linha de histórico quando não há compras concluídas", async () => {
    await recalcularScoreCliente(ids.org, ids.cliente);

    const historico = await obterHistoricoScore(ids.org, "cliente", ids.cliente);
    expect(historico).toHaveLength(1);
    expect(historico[0].valorPrincipal).toBe(50);
    expect(historico[0].versaoFormula).toBe("v2");
  });

  it("acumula uma nova linha a cada recálculo, preservando as anteriores", async () => {
    await sql`
      insert into public.pedido (id, org_id, brand_id, cliente_id, canal, status, total, recebido_em, criado_em)
      values (${ids.pedido1}, ${ids.org}, ${ids.brand}, ${ids.cliente}, 'whatsapp', 'concluido', '150.00', now(), now())
    `;
    await recalcularScoreCliente(ids.org, ids.cliente);

    await sql`
      insert into public.pedido (id, org_id, brand_id, cliente_id, canal, status, total, recebido_em, criado_em)
      values (${ids.pedido2}, ${ids.org}, ${ids.brand}, ${ids.cliente}, 'whatsapp', 'concluido', '300.00', now(), now())
    `;
    await recalcularScoreCliente(ids.org, ids.cliente);

    const historico = await obterHistoricoScore(ids.org, "cliente", ids.cliente);
    expect(historico.length).toBeGreaterThanOrEqual(3);
    expect(historico[0].calculadoEm.getTime()).toBeGreaterThanOrEqual(historico[historico.length - 1].calculadoEm.getTime());
  });
});
