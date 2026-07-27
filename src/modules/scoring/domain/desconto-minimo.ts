export interface DadosDescontoMinimo {
  precoAtual: number;
  custoUnitario: number;
  margemMinimaPercentual: number;
  conversaoSemDesconto: number;
  conversaoComDesconto: number;
  descontoHistoricoPercentual: number;
}

export interface ResultadoDescontoMinimo {
  descontoRecomendadoPercentual: number;
  descontoMaximoPelaMargemPercentual: number;
  motivo: string;
  versaoFormula: "v1";
}

export function calcularDescontoMinimo(dados: DadosDescontoMinimo): ResultadoDescontoMinimo {
  if (dados.precoAtual <= 0 || dados.custoUnitario < 0) {
    throw new Error("Preço e custo devem ser valores válidos.");
  }
  const margem = Math.min(99, Math.max(0, dados.margemMinimaPercentual)) / 100;
  const precoMinimo = dados.custoUnitario / (1 - margem);
  const descontoMaximo = Math.max(0, Math.min(100, (1 - precoMinimo / dados.precoAtual) * 100));
  const ganhoConversao = dados.conversaoComDesconto - dados.conversaoSemDesconto;
  const recomendado = ganhoConversao > 0
    ? Math.min(descontoMaximo, Math.max(0, dados.descontoHistoricoPercentual))
    : 0;
  return {
    descontoRecomendadoPercentual: Number(recomendado.toFixed(2)),
    descontoMaximoPelaMargemPercentual: Number(descontoMaximo.toFixed(2)),
    motivo: ganhoConversao > 0
      ? "Limitado pela margem mínima e sustentado pelo ganho histórico de conversão."
      : "Sem ganho histórico de conversão; não recomendar desconto.",
    versaoFormula: "v1",
  };
}
