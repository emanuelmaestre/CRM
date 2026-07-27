export interface DadosEncalhe {
  diasSemVenda: number;
  giroMensalMedio: number;
  saldoAtual: number;
  custoUnitario: number;
  tendenciaVendasPercentual?: number;
}

export interface ResultadoScoreProduto {
  riscoEncalhe: number;
  capitalParado: number;
  acaoSugerida: string;
  versaoFormula: string;
}

const VERSAO_FORMULA = "v2";
const LIMITE_DIAS_PARADO = 30;

export function calcularScoreProduto(dados: DadosEncalhe): ResultadoScoreProduto {
  const capitalParado = dados.saldoAtual * dados.custoUnitario;

  // Risco base por dias sem venda
  const riscoBase = Math.min(100, Math.floor((dados.diasSemVenda / LIMITE_DIAS_PARADO) * 60));

  // Agrava se giro baixo
  const fatorGiro = dados.giroMensalMedio < 1 ? 40 : dados.giroMensalMedio < 5 ? 20 : 0;
  const fatorTendencia = dados.tendenciaVendasPercentual == null
    ? 0
    : dados.tendenciaVendasPercentual <= -50 ? 20
    : dados.tendenciaVendasPercentual <= -20 ? 10
    : dados.tendenciaVendasPercentual >= 20 ? -10
    : 0;

  const riscoEncalhe = Math.max(0, Math.min(100, riscoBase + fatorGiro + fatorTendencia));

  let acaoSugerida = "Monitorar";
  if (riscoEncalhe >= 80) acaoSugerida = `Promoção urgente — R$ ${capitalParado.toFixed(2)} parado`;
  else if (riscoEncalhe >= 50) acaoSugerida = "Considerar kit ou bundle com produto de alto giro";
  else if (riscoEncalhe >= 30) acaoSugerida = "Revisar preço ou investir em divulgação";

  return { riscoEncalhe, capitalParado, acaoSugerida, versaoFormula: VERSAO_FORMULA };
}
