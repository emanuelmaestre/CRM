import { sql, type SQLWrapper } from "drizzle-orm";
import { pedido } from "@/shared/lib/db/schema";

/** Esta entrega não altera a regra dos demais canais. */
export function pedidoFaturavelNestaEntrega(
  canal: SQLWrapper = pedido.canal,
  status: SQLWrapper = pedido.status,
) {
  return sql`(case when ${canal} in ('shopee', 'tiktokshop')
    then ${status} in ('pago', 'separado', 'enviado', 'entregue', 'avaliacao_solicitada', 'concluido')
    else ${status} not in ('cancelado', 'devolvido') end)`;
}

/** Exclui apenas negativas explícitas. Cancelamentos legados sem prova
 * continuam pendentes de auditoria, não são convertidos em não pagos. */
export function cancelamentoFinanceiroNestaEntrega() {
  return sql`(case when ${pedido.canal} in ('shopee', 'tiktokshop')
    then (${pedido.dadosOrigem}->>'pagamentoAprovado') is distinct from 'false'
    else true end)`;
}
