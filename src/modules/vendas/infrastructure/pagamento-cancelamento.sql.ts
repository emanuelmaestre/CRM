import { sql } from "drizzle-orm";
import { pedido } from "@/shared/lib/db/schema";
import { dataPagamentoShopeeSql } from "./valor-shopee.sql";
import { pagamentoAprovadoPedidoSql } from "./valor-faturamento.sql";

/** Classifica evidência de pagamento sem tratar payload ausente como não pago.
 * A data e os marcadores positivos prevalecem sobre marcadores negativos antigos. */
export function pagamentoCancelamentoSql() {
  return sql<string>`case
    when ${pedido.canal} = 'shopee' then case
      when ${dataPagamentoShopeeSql()} is not null then 'pago'
      when ${pedido.dadosOrigem}->>'pagamentoConsultado' = 'true' then 'sem-pagamento'
      else 'a-verificar' end
    when ${pedido.canal} = 'tiktokshop' then case
      when ${dataPagamentoShopeeSql()} is not null or ${pedido.dadosOrigem}->>'pagamentoAprovado' = 'true' then 'pago'
      when ${pedido.dadosOrigem}->>'pagamentoAprovado' = 'false' then 'sem-pagamento'
      else 'a-verificar' end
    when ${pedido.canal} = 'mercadolivre' then case
      when ${pagamentoAprovadoPedidoSql()} then 'pago'
      when ${pedido.dadosOrigem}->>'pagamentoAprovado' = 'false'
        or (jsonb_typeof(${pedido.dadosOrigem}->'pagamentos') = 'array'
          and jsonb_typeof(${pedido.dadosOrigem}->'valorPago') = 'number') then 'sem-pagamento'
      else 'a-verificar' end
    else 'a-verificar' end`;
}
