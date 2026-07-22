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

// v1: pesos iguais (legado)
// v2: pesos calibrados para e-commerce brasileiro (recência 50%, freq 30%, valor 20%)
const VERSAO_FORMULA = "v2";

function calcularV1(dados: DadosRFM): ResultadoScoreCliente {
  const rfmRecencia = Math.max(0, 100 - Math.floor(dados.diasDesdeUltimaCompra / 3));
  const rfmFrequencia = Math.min(100, Math.floor(Math.log10(dados.totalCompras + 1) * 50));
  const rfmValor = Math.min(100, Math.floor(dados.valorTotalGasto / 100));
  const scoreMedia = (rfmRecencia + rfmFrequencia + rfmValor) / 3;
  const churnRisk = Math.round(Math.max(0, 100 - scoreMedia));
  const proximaCompraEstimadaDias = dados.intervalMedioEntrCompras
    ? Math.round(dados.intervalMedioEntrCompras - dados.diasDesdeUltimaCompra)
    : null;
  const explicacao =
    `${dados.totalCompras} compra(s), última há ${dados.diasDesdeUltimaCompra} dia(s)` +
    (dados.intervalMedioEntrCompras ? `, intervalo médio ${Math.round(dados.intervalMedioEntrCompras)} dias` : "") +
    `. Valor total: R$ ${dados.valorTotalGasto.toFixed(2)}.`;
  return { churnRisk, rfmRecencia, rfmFrequencia, rfmValor, proximaCompraEstimadaDias, explicacao, versaoFormula: "v1" };
}

function calcularV2(dados: DadosRFM): ResultadoScoreCliente {
  // Recência: decai exponencialmente — 90 dias = 0 pts
  const rfmRecencia = Math.round(Math.max(0, 100 * Math.exp(-dados.diasDesdeUltimaCompra / 30)));

  // Frequência: raiz quadrada normalizada (cap 10 compras = 100 pts)
  const rfmFrequencia = Math.min(100, Math.round(Math.sqrt(dados.totalCompras) * 31.6));

  // Valor: log10 normalizado (R$1k = ~100 pts)
  const rfmValor = Math.min(100, Math.round(Math.log10(dados.valorTotalGasto + 1) * 33));

  // Pesos: recência 50%, freq 30%, valor 20%
  const scoreComPeso = rfmRecencia * 0.5 + rfmFrequencia * 0.3 + rfmValor * 0.2;
  const churnRisk = Math.round(Math.max(0, Math.min(100, 100 - scoreComPeso)));

  const proximaCompraEstimadaDias = dados.intervalMedioEntrCompras != null && dados.intervalMedioEntrCompras > 0
    ? Math.max(0, Math.round(dados.intervalMedioEntrCompras - dados.diasDesdeUltimaCompra))
    : null;

  const segmento =
    churnRisk <= 20 ? "Campeão" :
    churnRisk <= 40 ? "Leal" :
    churnRisk <= 60 ? "Em risco" :
    churnRisk <= 80 ? "Adormecido" : "Perdido";

  const explicacao =
    `[${segmento}] ${dados.totalCompras} compra(s), última há ${dados.diasDesdeUltimaCompra} dia(s)` +
    (dados.intervalMedioEntrCompras ? `, intervalo médio ${Math.round(dados.intervalMedioEntrCompras)} dias` : "") +
    `. Valor total: R$ ${dados.valorTotalGasto.toFixed(2)}.` +
    ` R=${rfmRecencia} F=${rfmFrequencia} M=${rfmValor} → churn ${churnRisk}%.`;

  return { churnRisk, rfmRecencia, rfmFrequencia, rfmValor, proximaCompraEstimadaDias, explicacao, versaoFormula: "v2" };
}

export function calcularScoreCliente(dados: DadosRFM, versao: "v1" | "v2" = VERSAO_FORMULA): ResultadoScoreCliente {
  return versao === "v1" ? calcularV1(dados) : calcularV2(dados);
}

export { VERSAO_FORMULA };
