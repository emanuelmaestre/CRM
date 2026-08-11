export interface DadosDescontoMinimo {
  precoAtual: number;
  descontoMaximoPercentual: number;
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

// v1 usava custo do produto pra calcular a margem e derivar o teto de
// desconto (precoMinimo = custo / (1 - margem)). Sem custo cadastrado no
// sistema, o teto agora vem direto de um percentual configurado — mais
// simples, sem depender de um dado que o catálogo não mantém mais.
export function calcularDescontoMinimo(dados: DadosDescontoMinimo): ResultadoDescontoMinimo {
  if (dados.precoAtual <= 0) {
    throw new Error("Preço deve ser um valor válido.");
  }
  const descontoMaximo = Math.max(0, Math.min(100, dados.descontoMaximoPercentual));
  const ganhoConversao = dados.conversaoComDesconto - dados.conversaoSemDesconto;
  const recomendado = ganhoConversao > 0
    ? Math.min(descontoMaximo, Math.max(0, dados.descontoHistoricoPercentual))
    : 0;
  return {
    descontoRecomendadoPercentual: Number(recomendado.toFixed(2)),
    descontoMaximoPelaMargemPercentual: Number(descontoMaximo.toFixed(2)),
    motivo: ganhoConversao > 0
      ? "Limitado pelo teto de desconto configurado e sustentado pelo ganho histórico de conversão."
      : "Sem ganho histórico de conversão; não recomendar desconto.",
    versaoFormula: "v1",
  };
}
