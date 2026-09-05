/** Estados que provam que o pagamento já foi confirmado pelo canal.
 *
 * `criado` fica deliberadamente de fora: ele representa também UNPAID,
 * TO_PAY, payment_required e outros checkouts que ainda podem expirar sem
 * virar venda. Uma lista positiva é mais segura que "tudo menos cancelado":
 * status novo ou desconhecido nunca entra no faturamento por acidente. */
export const STATUS_PEDIDO_FATURAVEL = [
  "pago",
  "separado",
  "enviado",
  "entregue",
  "avaliacao_solicitada",
  "concluido",
] as const;

export type StatusPedidoFaturavel = (typeof STATUS_PEDIDO_FATURAVEL)[number];

export function statusPedidoFaturavel(status: string): status is StatusPedidoFaturavel {
  return (STATUS_PEDIDO_FATURAVEL as readonly string[]).includes(status);
}

function objeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

const STATUS_PAGAMENTO_APROVADO = new Set([
  "approved",
  "paid",
  "partially_refunded",
  "refunded",
  "charged_back",
]);

function numeroPositivo(valor: unknown): boolean {
  return typeof valor === "number" && Number.isFinite(valor) && valor > 0;
}

/**
 * Identifica prova financeira preservada no payload do canal.
 *
 * No Mercado Livre, `valorPago` vem de `paid_amount`; `pagamentos[].total`
 * vem de `total_paid_amount`; e um reembolso positivo prova que o pagamento
 * existiu antes do cancelamento. O marcador `pagamentoAprovado` é gravado
 * pelo CRM quando o pedido passa por um estado faturável e nunca regride.
 */
export function possuiEvidenciaPagamentoAprovado(dadosOrigem: unknown): boolean {
  if (!objeto(dadosOrigem)) return false;
  if (dadosOrigem.pagamentoAprovado === true || numeroPositivo(dadosOrigem.valorPago)) return true;
  if (!Array.isArray(dadosOrigem.pagamentos)) return false;

  return dadosOrigem.pagamentos.some((pagamento) => {
    if (!objeto(pagamento)) return false;
    const status = typeof pagamento.status === "string" ? pagamento.status.toLowerCase() : "";
    return STATUS_PAGAMENTO_APROVADO.has(status)
      || numeroPositivo(pagamento.total)
      || numeroPositivo(pagamento.reembolsado);
  });
}

/** Acrescenta a decisão financeira ao payload sem apagar os dados do canal. */
export function marcarEvidenciaPagamento(
  dadosOrigem: unknown,
  status: string,
  pagamentoAprovadoAnteriormente = false,
): Record<string, unknown> {
  const dados = objeto(dadosOrigem) ? dadosOrigem : {};
  return {
    ...dados,
    pagamentoAprovado: pagamentoAprovadoAnteriormente
      || statusPedidoFaturavel(status)
      || possuiEvidenciaPagamentoAprovado(dados),
  };
}

/**
 * Soma apenas reembolsos que o canal informou explicitamente.
 *
 * Ausência, null, string inesperada ou JSON incompleto retornam zero. Isso é
 * deliberadamente conservador: falta de dado nunca apaga faturamento válido.
 */
export function reembolsoParcialInformado(dadosOrigem: unknown): number {
  if (!objeto(dadosOrigem) || !Array.isArray(dadosOrigem.pagamentos)) return 0;

  const centavos = dadosOrigem.pagamentos.reduce((total, pagamento) => {
    if (!objeto(pagamento)) return total;
    const valor = pagamento.reembolsado;
    if (typeof valor !== "number" || !Number.isFinite(valor) || valor <= 0) return total;
    return total + Math.round(valor * 100);
  }, 0);
  return centavos / 100;
}

/** Receita efetivamente preservada, mantendo `pedido.total` como bruto. */
export function valorFaturavelPedido(total: unknown, dadosOrigem: unknown): number {
  const bruto = Number(total);
  if (!Number.isFinite(bruto) || bruto <= 0) return 0;
  return Math.max(0, Math.round((bruto - reembolsoParcialInformado(dadosOrigem)) * 100) / 100);
}
