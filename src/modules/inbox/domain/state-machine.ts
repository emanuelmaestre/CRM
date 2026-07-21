export type ConversaStatus =
  | "nova" | "em_atendimento" | "aguardando_cliente" | "resolvida" | "arquivada";

const transicoes: Record<ConversaStatus, ConversaStatus[]> = {
  nova: ["em_atendimento", "arquivada"],
  em_atendimento: ["aguardando_cliente", "resolvida"],
  aguardando_cliente: ["em_atendimento", "resolvida", "arquivada"],
  resolvida: ["em_atendimento"],
  arquivada: [],
};

export function validarTransicaoConversa(atual: ConversaStatus, proximo: ConversaStatus): void {
  const permitidos = transicoes[atual];
  if (!permitidos.includes(proximo)) {
    throw new Error(
      `Transição de conversa inválida: ${atual} → ${proximo}. Permitidas: ${permitidos.join(", ") || "nenhuma"}`
    );
  }
}

export function reabrirSeNecessario(statusAtual: ConversaStatus): ConversaStatus {
  if (statusAtual === "resolvida" || statusAtual === "arquivada") return "em_atendimento";
  return statusAtual;
}
