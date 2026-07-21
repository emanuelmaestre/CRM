export interface DadosRFM {
  diasDesdeUltimaCompra: number;
  totalCompras: number;
  valorTotalGasto: number;
  intervalMedioEntrCompras: number | null;
}

export interface ResultadoScoreCliente {
  churnRisk: number;
  rfmRecencia: number;
  rfmFrequencia: number;
  rfmValor: number;
  proximaCompraEstimadaDias: number | null;
  explicacao: string;
  versaoFormula: string;
}

const VERSAO_FORMULA = "v1";

export function calcularScoreCliente(dados: DadosRFM): ResultadoScoreCliente {
  // Recência: 0–100, quanto menor o intervalo melhor
  const rfmRecencia = Math.max(0, 100 - Math.floor(dados.diasDesdeUltimaCompra / 3));

  // Frequência: 0–100, escala logarítmica
  const rfmFrequencia = Math.min(100, Math.floor(Math.log10(dados.totalCompras + 1) * 50));

  // Valor: 0–100, relativo ao ticket médio
  const rfmValor = Math.min(100, Math.floor(dados.valorTotalGasto / 100));

  // Churn risk: inverso do score médio (0 = fidelíssimo, 100 = sumiu)
  const scoreMedia = (rfmRecencia + rfmFrequencia + rfmValor) / 3;
  const churnRisk = Math.round(Math.max(0, 100 - scoreMedia));

  // Estimativa de próxima compra
  const proximaCompraEstimadaDias = dados.intervalMedioEntrCompras
    ? Math.round(dados.intervalMedioEntrCompras - dados.diasDesdeUltimaCompra)
    : null;

  const explicacao =
    `${dados.totalCompras} compra(s), última há ${dados.diasDesdeUltimaCompra} dia(s)` +
    (dados.intervalMedioEntrCompras
      ? `, intervalo médio ${Math.round(dados.intervalMedioEntrCompras)} dias`
      : "") +
    `. Valor total: R$ ${dados.valorTotalGasto.toFixed(2)}.`;

  return {
    churnRisk,
    rfmRecencia,
    rfmFrequencia,
    rfmValor,
    proximaCompraEstimadaDias,
    explicacao,
    versaoFormula: VERSAO_FORMULA,
  };
}
