import { sql } from "drizzle-orm";
import { pedido } from "@/shared/lib/db/schema";

/** Business Insights: preço acordado dos produtos, sem frete do checkout.
 * Mantém pedido.total intacto para o detalhe financeiro e para outros canais. */
export function valorProdutosShopeeSql() {
  return sql<number>`case when ${pedido.canal} = 'shopee' then
    case when jsonb_typeof(${pedido.dadosOrigem}->'totalProdutos') = 'number'
      then (${pedido.dadosOrigem}->>'totalProdutos')::numeric
      else ${pedido.total} end
    else ${pedido.total} end`;
}

/** Produto Pago pertence ao dia do pagamento, inclusive quando houve
 * cancelamento posterior. Sem pay_time não inventamos a data da aprovação. */
export function dataPagamentoShopeeSql() {
  return sql`case when jsonb_typeof(${pedido.dadosOrigem}->'pagoEmMs') = 'number'
    then case when (${pedido.dadosOrigem}->>'pagoEmMs')::numeric > 0
      then to_timestamp((${pedido.dadosOrigem}->>'pagoEmMs')::double precision / 1000)
      else null end else null end`;
}
