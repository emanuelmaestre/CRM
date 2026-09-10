import { afterAll, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import { dataPagamentoTikTokSql, pedidoGmvTikTokSql, valorGmvTikTokSql } from "@/modules/vendas/infrastructure/gmv-tiktok.sql";

const client = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
const db = drizzle(client);
afterAll(() => client.end());

it("GMV usa pagamento em Brasília, mantém cancelados/reembolsados e exclui amostras e outros canais", async () => {
  const pagoEmMs = Date.parse("2026-09-02T00:00:00-03:00");
  const dados = [
    { id: 1, canal: "tiktokshop", status: "cancelado", total: 25, criado_em: "2026-08-31", dados_origem: { pagoEmMs, gmvTikTok: 23 } },
    { id: 2, canal: "tiktokshop", status: "devolvido", total: 12.5, dados_origem: { pagoEmMs, reembolsoIntegral: true } },
    { id: 3, canal: "tiktokshop", status: "pago", total: 0, dados_origem: { pagoEmMs, amostraGratis: true } },
    { id: 4, canal: "tiktokshop", status: "pago", total: 10, dados_origem: { pagoEmMs: pagoEmMs - 1 } },
    { id: 5, canal: "tiktokshop", status: "pago", total: 10, dados_origem: { pagoEmMs: pagoEmMs + 86400000 } },
    ...[null, "inválido", 0, -1].map((data, i) => ({ id: 6+i, canal: "tiktokshop", status: "pago", total: 10, dados_origem: { pagoEmMs: data } })),
    { id: 10, canal: "shopee", status: "pago", total: 10, dados_origem: { pagoEmMs } },
    { id: 11, canal: "mercadolivre", status: "pago", total: 10, dados_origem: { pagoEmMs } },
  ];
  const [r] = await db.execute(sql`with pedido as (
    select * from jsonb_to_recordset(${JSON.stringify(dados)}::jsonb)
    as x(id int, canal text, status text, total numeric, dados_origem jsonb, criado_em date)
  ) select sum(${valorGmvTikTokSql()})::float8 valor, count(*)::int quantidade, array_agg(id order by id) ids
  from pedido where ${pedidoGmvTikTokSql()}
    and ${dataPagamentoTikTokSql()} >= '2026-09-02T00:00:00-03:00'::timestamptz
    and ${dataPagamentoTikTokSql()} <= '2026-09-02T23:59:59.999-03:00'::timestamptz`);
  expect(r).toEqual({ valor: 35.5, quantidade: 2, ids: [1, 2] });
});
