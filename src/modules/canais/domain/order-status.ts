export type PedidoStatus =
  | "criado"
  | "pago"
  | "separado"
  | "enviado"
  | "entregue"
  | "avaliacao_solicitada"
  | "concluido"
  | "cancelado"
  | "devolvido";

export type OrigemIngestaoPedido = "tempo_real" | "historico";

export function deveExecutarEfeitosOperacionais(origem: OrigemIngestaoPedido): boolean {
  return origem === "tempo_real";
}

export function mapearStatusPedido(statusExterno: string): PedidoStatus {
  const mapa: Record<string, PedidoStatus> = {
    unpaid: "criado",
    to_pay: "criado",
    paid: "pago",
    ready_to_ship: "separado",
    // Shopee: depois de READY_TO_SHIP o pedido passa por PROCESSED (envio já
    // agendado, aguardando a coleta) e, se a coleta falha, por RETRY_SHIP —
    // nenhum dos dois estava neste mapa, então caíam no fallback "criado" e
    // ficavam presos ali (9 pedidos da WUWU parados desde 09/08/2026).
    processed: "separado",
    retry_ship: "separado",
    shipped: "enviado",
    // Entregue ao comprador, aguardando ele confirmar o recebimento.
    to_confirm_receive: "entregue",
    // Devolução pedida pelo comprador; "devolvido" é o estágio mais próximo
    // que o domínio tem — só se aplica a pedido já enviado (ver
    // deveAplicarStatusMarketplace).
    to_return: "devolvido",
    in_cancel: "cancelado",
    cancelled: "cancelado",
    completed: "concluido",
    returned: "devolvido",
    payment_pending: "criado",
    payment_done: "pago",
    delivered: "entregue",
    approved: "pago",
    invoiced: "separado",
    collected: "enviado",
    partially_collected: "enviado",
    partially_returned: "devolvido",
    partially_refunded: "pago",
    payment_required: "criado",
    payment_in_process: "criado",
    partially_paid: "criado",
    confirmed: "criado",
    invalid: "cancelado",
    pending: "criado",
    awaiting_shipment: "pago",
    awaiting_collection: "separado",
    // TikTok: coletado pela transportadora e a caminho. Sem isto caía no
    // fallback "criado" — 115 dos 1457 pedidos das três marcas numa
    // importação real de 90 dias em 03/09/2026 apareceriam como recém-criados
    // estando a caminho do comprador.
    in_transit: "enviado",
  };
  const chave = statusExterno.toLowerCase();
  const conhecido = mapa[chave];
  if (conhecido) return conhecido;

  // O fallback silencioso é o que escondeu `processed` por semanas: pedido
  // real entrava como "criado" e nada denunciava a lacuna. Continua caindo em
  // "criado" (é o estágio mais conservador — não avança nada que não deva),
  // mas agora deixa rastro no log da sincronização.
  if (chave && !statusDesconhecidoJaAvisado.has(chave)) {
    statusDesconhecidoJaAvisado.add(chave);
    console.warn(`[pedidos] status externo desconhecido "${statusExterno}" — tratado como "criado". Ver mapearStatusPedido.`);
  }
  return "criado";
}

/** Um aviso por valor, não um por pedido: uma sincronização de 15 dias
 *  passaria centenas de pedidos com o mesmo status pelo mapa. */
const statusDesconhecidoJaAvisado = new Set<string>();

const progressao: Record<Exclude<PedidoStatus, "cancelado" | "devolvido">, number> = {
  criado: 0,
  pago: 1,
  separado: 2,
  enviado: 3,
  entregue: 4,
  avaliacao_solicitada: 5,
  concluido: 6,
};

export function deveAplicarStatusMarketplace(atual: PedidoStatus, proximo: PedidoStatus): boolean {
  if (atual === proximo || ["cancelado", "devolvido"].includes(atual)) return false;
  if (proximo === "cancelado") return true;
  if (proximo === "devolvido") return progressao[atual as keyof typeof progressao] >= 3;
  if (atual === "concluido") return false;
  return progressao[proximo] > progressao[atual as keyof typeof progressao];
}
