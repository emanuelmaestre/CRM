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
    shipped: "enviado",
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
    pending: "criado",
    awaiting_shipment: "pago",
    awaiting_collection: "separado",
  };
  return mapa[statusExterno.toLowerCase()] ?? "criado";
}

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
  if (atual === proximo || ["concluido", "cancelado", "devolvido"].includes(atual)) return false;
  if (proximo === "cancelado") return progressao[atual as keyof typeof progressao] <= 2;
  if (proximo === "devolvido") return progressao[atual as keyof typeof progressao] >= 3;
  return progressao[proximo] > progressao[atual as keyof typeof progressao];
}
