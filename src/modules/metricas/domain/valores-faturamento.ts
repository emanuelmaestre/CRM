import { liquidoDoPedido } from "@/modules/vendas/domain/liquido-pedido";
import { reembolsoParcialInformado } from "@/modules/vendas/domain/status-faturamento";

/** Mantém separados o bruto oficial, a receita preservada e o repasse. */
export function valoresFaturamento(entrada: {
  bruto: number;
  original: number;
  confirmado: number;
  faturavel: boolean;
  frete: number;
  valorLiquido: string | number | null;
  dadosOrigem: unknown;
  taxasConhecidas: number;
}) {
  const receita = entrada.faturavel ? entrada.confirmado : 0;
  const reembolso = entrada.faturavel
    ? Math.min(entrada.original, reembolsoParcialInformado(entrada.dadosOrigem)) : 0;
  return {
    bruto: entrada.bruto,
    receita,
    reembolso,
    ajusteBase: entrada.faturavel ? receita + reembolso - entrada.bruto : 0,
    canceladoDevolvido: entrada.faturavel ? 0 : entrada.bruto,
    liquido: entrada.faturavel ? liquidoDoPedido({
      total: receita, frete: entrada.frete,
      valorLiquido: entrada.valorLiquido, taxasConhecidas: entrada.taxasConhecidas,
    }) : 0,
  };
}
