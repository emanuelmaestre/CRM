export type PedidoStatus =
  | "criado" | "pago" | "separado" | "enviado"
  | "entregue" | "avaliacao_solicitada" | "concluido"
  | "cancelado" | "devolvido";

const transicoes: Record<PedidoStatus, PedidoStatus[]> = {
  criado: ["pago", "cancelado"],
  pago: ["separado", "cancelado"],
  separado: ["enviado", "cancelado"],
  enviado: ["entregue"],
  entregue: ["avaliacao_solicitada", "devolvido"],
  avaliacao_solicitada: ["concluido"],
  concluido: [],
  cancelado: [],
  devolvido: [],
};

export function validarTransicaoPedido(atual: PedidoStatus, proximo: PedidoStatus): void {
  const permitidos = transicoes[atual];
  if (!permitidos.includes(proximo)) {
    throw new Error(
      `Transição inválida: ${atual} → ${proximo}. Permitidas: ${permitidos.join(", ") || "nenhuma"}`
    );
  }
}

export function podeCancelar(status: PedidoStatus): boolean {
  return ["criado", "pago", "separado"].includes(status);
}
