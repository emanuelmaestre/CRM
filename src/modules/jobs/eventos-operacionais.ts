/** Eventos autenticados para disparos operacionais fora do cron. Mantê-los
 * centralizados impede que o script de operação e os jobs divirjam. */
export const EVENTO_RECONCILIAR_PEDIDOS = "operacao/reconciliacao-pedidos.solicitada";
export const EVENTO_AUDITAR_FINANCEIRO = "operacao/auditoria-financeira.solicitada";
