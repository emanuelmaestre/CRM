import type { PedidoNormalizado } from "./ports";

export function preservarFinanceiroConfirmado(
  atual: { canal: string; valorLiquido: string | null; dadosOrigem: unknown },
  recebido: PedidoNormalizado,
): boolean {
  if (atual.canal !== "shopee" || recebido.canal !== "shopee") return false;
  const dados = atual.dadosOrigem as Record<string, unknown> | null;
  const confirmado = dados?.financeiroInformado === true || atual.valorLiquido !== null;
  return confirmado && recebido.dadosOrigem?.financeiroInformado !== true && recebido.valorLiquido === undefined;
}
