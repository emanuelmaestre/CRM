export interface ComposicaoFaturamento {
  /** Soma de todos os pedidos recebidos no recorte, inclusive os que depois
   * foram cancelados ou devolvidos. */
  pedidosBrutosNumerico: number;
  /** Parcela dos pedidos brutos que não compõe o faturamento do CRM. */
  canceladosDevolvidosNumerico: number;
  /** Receita preservada pelo contrato atual do CRM. */
  faturamentoValidoNumerico: number;
}

function centavos(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

/**
 * Explica o faturamento sem mudar sua regra de negócio:
 * pedidos brutos - cancelados/devolvidos = faturamento válido.
 *
 * A função é pura para poder rodar em sombra e ser comparada com o campo
 * legado antes de qualquer dado novo chegar à interface.
 */
export function calcularComposicaoFaturamento(
  faturamentoValido: number,
  cancelados: number,
  devolvidos: number,
): ComposicaoFaturamento {
  const faturamentoValidoNumerico = centavos(faturamentoValido);
  const canceladosDevolvidosNumerico = centavos(cancelados + devolvidos);
  return {
    pedidosBrutosNumerico: centavos(faturamentoValidoNumerico + canceladosDevolvidosNumerico),
    canceladosDevolvidosNumerico,
    faturamentoValidoNumerico,
  };
}
