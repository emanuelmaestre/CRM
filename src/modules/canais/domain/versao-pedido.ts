/** Payload sem versão não pode substituir uma fotografia já versionada. */
export function podeAplicarVersaoPedido(atual: Date | null, recebida?: Date): boolean {
  if (recebida && !Number.isFinite(recebida.getTime())) return false;
  return !atual || !!recebida && recebida.getTime() >= atual.getTime();
}
