export interface DadosRFM {
  diasDesdeUltimaCompra: number;
  totalCompras: number;
  valorTotalGasto: number;
  intervalMedioEntrCompras: number | null;
}

export type SegmentoCliente = "Campeão" | "Leal" | "Em risco" | "Adormecido" | "Perdido";

export interface ResultadoScoreCliente {
  churnRisk: number;
  rfmRecencia: number;
  rfmFrequencia: number;
  rfmValor: number;
  proximaCompraEstimadaDias: number | null;
  probabilidadeRecompra30d: number;
  segmento: SegmentoCliente;
  acaoSugerida: string;
  explicacao: string;
  versaoFormula: string;
}

// Probabilidade de recompra nos próximos 30 dias — modelo exponencial
// (processo de Poisson, memoryless): P(recompra em N dias) = 1 - e^(-N/intervalo).
// Não é ML nem depende de dado que o sistema não tem — só usa o intervalo médio
// real entre as compras do próprio cliente. Cliente com uma única compra ainda
// não tem intervalo, então cai para uma estimativa grosseira via churnRisk.
function calcularProbabilidadeRecompra30d(
  churnRisk: number,
  intervalMedioEntrCompras: number | null,
): number {
  if (intervalMedioEntrCompras == null || intervalMedioEntrCompras <= 0) {
    return Math.max(0, Math.min(100, 100 - churnRisk));
  }
  const probabilidade = (1 - Math.exp(-30 / intervalMedioEntrCompras)) * 100;
  return Math.round(Math.max(0, Math.min(100, probabilidade)));
}

// "Esfriamento" é a faixa de transição: o cliente ainda compra mas o
// intervalo entre compras já supera o padrão dele — se nada for feito, vira
// "Adormecido". Distinto de churn puro: aqui ainda há janela de recuperação
// barata (contato) antes de precisar de reativação agressiva.
export function estaEsfriando(segmento: SegmentoCliente): boolean {
  return segmento === "Em risco" || segmento === "Adormecido";
}

function sugerirAcaoComercial(
  segmento: SegmentoCliente,
  proximaCompraEstimadaDias: number | null,
): string {
  if (proximaCompraEstimadaDias != null && proximaCompraEstimadaDias <= 7 && proximaCompraEstimadaDias >= 0) {
    return `Previsão de recompra em ${proximaCompraEstimadaDias} dia(s) — bom momento para oferta de continuidade`;
  }
  switch (segmento) {
    case "Campeão":
      return "Manter relacionamento — considerar upsell ou cross-sell";
    case "Leal":
      return "Cliente estável — reforçar com programa de fidelidade ou indicação";
    case "Em risco":
      return "Cliente esfriando — enviar lembrete ou oferta antes que o intervalo aumente mais";
    case "Adormecido":
      return "Sem compra recente — contato personalizado com oferta de reativação";
    case "Perdido":
      return "Considerar campanha de win-back agressiva ou encerrar investimento neste cliente";
  }
}

// v1: pesos iguais (legado)
// v2: pesos calibrados para e-commerce brasileiro (recência 50%, freq 30%, valor 20%)
const VERSAO_FORMULA = "v2";

function segmentarPorChurn(churnRisk: number): SegmentoCliente {
  return churnRisk <= 20 ? "Campeão" :
    churnRisk <= 40 ? "Leal" :
    churnRisk <= 60 ? "Em risco" :
    churnRisk <= 80 ? "Adormecido" : "Perdido";
}

function calcularV1(dados: DadosRFM): ResultadoScoreCliente {
  const rfmRecencia = Math.max(0, 100 - Math.floor(dados.diasDesdeUltimaCompra / 3));
  const rfmFrequencia = Math.min(100, Math.floor(Math.log10(dados.totalCompras + 1) * 50));
  const rfmValor = Math.min(100, Math.floor(dados.valorTotalGasto / 100));
  const scoreMedia = (rfmRecencia + rfmFrequencia + rfmValor) / 3;
  const churnRisk = Math.round(Math.max(0, 100 - scoreMedia));
  const proximaCompraEstimadaDias = dados.intervalMedioEntrCompras
    ? Math.round(dados.intervalMedioEntrCompras - dados.diasDesdeUltimaCompra)
    : null;
  const segmento = segmentarPorChurn(churnRisk);
  const probabilidadeRecompra30d = calcularProbabilidadeRecompra30d(churnRisk, dados.intervalMedioEntrCompras);
  const explicacao =
    `${dados.totalCompras} compra(s), última há ${dados.diasDesdeUltimaCompra} dia(s)` +
    (dados.intervalMedioEntrCompras ? `, intervalo médio ${Math.round(dados.intervalMedioEntrCompras)} dias` : "") +
    `. Valor total: R$ ${dados.valorTotalGasto.toFixed(2)}.`;
  return {
    churnRisk, rfmRecencia, rfmFrequencia, rfmValor, proximaCompraEstimadaDias, probabilidadeRecompra30d,
    segmento, acaoSugerida: sugerirAcaoComercial(segmento, proximaCompraEstimadaDias),
    explicacao, versaoFormula: "v1",
  };
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

  const segmento = segmentarPorChurn(churnRisk);
  const probabilidadeRecompra30d = calcularProbabilidadeRecompra30d(churnRisk, dados.intervalMedioEntrCompras);

  const explicacao =
    `[${segmento}] ${dados.totalCompras} compra(s), última há ${dados.diasDesdeUltimaCompra} dia(s)` +
    (dados.intervalMedioEntrCompras ? `, intervalo médio ${Math.round(dados.intervalMedioEntrCompras)} dias` : "") +
    `. Valor total: R$ ${dados.valorTotalGasto.toFixed(2)}.` +
    ` R=${rfmRecencia} F=${rfmFrequencia} M=${rfmValor} → churn ${churnRisk}%. Prob. recompra 30d: ${probabilidadeRecompra30d}%.`;

  return {
    churnRisk, rfmRecencia, rfmFrequencia, rfmValor, proximaCompraEstimadaDias, probabilidadeRecompra30d,
    segmento, acaoSugerida: sugerirAcaoComercial(segmento, proximaCompraEstimadaDias),
    explicacao, versaoFormula: "v2",
  };
}

export function calcularScoreCliente(dados: DadosRFM, versao: "v1" | "v2" = VERSAO_FORMULA): ResultadoScoreCliente {
  return versao === "v1" ? calcularV1(dados) : calcularV2(dados);
}

export { VERSAO_FORMULA };
