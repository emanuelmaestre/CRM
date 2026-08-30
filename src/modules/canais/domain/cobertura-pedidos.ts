/** O progresso persistido não é o horário do último webhook. */
export function inicioColetaPedidos(agoraMs: number, ultimoSucesso: unknown, janelaInicialMs: number): Date {
  const anterior = typeof ultimoSucesso === "string" ? Date.parse(ultimoSucesso) : NaN;
  if (!Number.isFinite(anterior) || anterior > agoraMs) return new Date(agoraMs - janelaInicialMs);
  return new Date(Math.min(agoraMs - janelaInicialMs, anterior - 60 * 60_000));
}
