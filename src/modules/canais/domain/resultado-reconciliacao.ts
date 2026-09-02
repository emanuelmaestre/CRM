export interface ResultadoReconciliacaoConta {
  contaId: string;
  tipo: string;
  marca: string;
  execucaoId?: string;
  adiada?: string;
  erro?: string;
}

export function resumirResultadosReconciliacao(resultados: ResultadoReconciliacaoConta[]) {
  return {
    contas: resultados.length,
    despachadas: resultados.filter((item) => item.execucaoId).length,
    adiadas: resultados.filter((item) => item.adiada).length,
    falhas: resultados.filter((item) => item.erro).length,
  };
}

/** Falha isolada não invalida contas saudáveis; adiamento por concorrência
 * também não é erro. O job só deve ficar vermelho quando todas falharam. */
export function reconciliacaoFalhouPorCompleto(resultados: ResultadoReconciliacaoConta[]): boolean {
  return resultados.length > 0 && resultados.every((item) => Boolean(item.erro));
}
