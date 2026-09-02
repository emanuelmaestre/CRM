/** O progresso persistido não é o horário do último webhook. */
export function inicioColetaPedidos(agoraMs: number, ultimoSucesso: unknown, janelaInicialMs: number): Date {
  const anterior = typeof ultimoSucesso === "string" ? Date.parse(ultimoSucesso) : NaN;
  if (!Number.isFinite(anterior) || anterior > agoraMs) return new Date(agoraMs - janelaInicialMs);
  return new Date(Math.min(agoraMs - janelaInicialMs, anterior - 60 * 60_000));
}

/** A cobertura só pode avançar se todo pedido recusado já tiver uma cópia
 * durável em `pedido_ignorado`. Erro sem registro ainda depende da mesma
 * janela para ser visto novamente. */
export function podeAvancarCoberturaPedidos(falhasSemRegistro: number): boolean {
  return Number.isInteger(falhasSemRegistro) && falhasSemRegistro === 0;
}
