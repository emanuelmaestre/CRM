/* ── Radar de Oportunidades (Fase 3) ──────────────────────────────
   Responde "onde existe dinheiro sendo deixado na mesa?" — quatro tipos
   concretos do brief, cada um com critério explícito (nunca escondido) e
   nível de confiança. O quinto tipo do brief ("Oportunidade de produto":
   Mercado Livre recomenda anunciar) depende de um campo que a Fase 1 ainda
   não captura — o snapshot de hoje não guarda a recomendação do ML por
   item. Documentado abaixo, não implementado às cegas. */

export type TipoOportunidade = "escala" | "recuperacao" | "ranking" | "orcamento";

export type ImpactoOportunidade = "alto" | "medio" | "baixo";

export interface Oportunidade {
  tipo: TipoOportunidade;
  campanhaId: string;
  campanhaNome: string;
  titulo: string;
  explicacao: string;
  /** Nunca escondido — o brief pede "nunca esconder os critérios" (seção 35). */
  criterios: string[];
  impacto: ImpactoOportunidade;
  /** 0–100, mesma régua usada para ordenar a lista final. */
  scoreImpacto: number;
}

export interface DadosOportunidadeCampanha {
  campanhaId: string;
  campanhaNome: string;
  roasAtual: number | null;
  roasMinimo: number | null;
  roasAnterior: number | null;
  cvr: number | null;
  gastoAtual: number;
  lucroEstimado: number | null;
  estoqueDiasCobertura: number | null;
  lostImpressionShareByBudget: number | null;
  lostImpressionShareByAdRank: number | null;
  /** Perguntas > cliques mínimos para a leitura ter alguma confiança —
   *  mesma régua da Fase 3 do motor de diagnóstico. */
  cliques: number;
}

const LIMIARES_OPORTUNIDADE = {
  cliquesMinimos: 20,
  cvrBom: 0.03,
  toleranciaBreakEven: 0.1,
  perdaRelevante: 0.15,
  estoqueDiasMinimoParaEscalar: 15,
  quedaRoasRelevante: 0.3, // 30% de queda
} as const;

/** Base do score: lucro estimado quando existe (Fase 2 já cruzou com custo),
 *  senão o gasto da campanha — melhor que nada pra ordenar por relevância. */
function baseDeImpacto(dados: DadosOportunidadeCampanha): number {
  return dados.lucroEstimado ?? dados.gastoAtual;
}

function scorePorImpacto(gastoOuLucro: number, confiancaAlta: boolean): { impacto: ImpactoOportunidade; score: number } {
  // Impacto financeiro combinado com confiança — um valor alto com pouca
  // amostra pontua menos que o mesmo valor com amostra robusta (brief
  // seção 35: "impacto financeiro" e "nível de confiança" são fatores
  // separados, mas a lista final precisa de uma ordem só).
  const base = Math.min(100, Math.round((Math.abs(gastoOuLucro) / 10)));
  const score = confiancaAlta ? base : Math.round(base * 0.6);
  const impacto: ImpactoOportunidade = score >= 60 ? "alto" : score >= 30 ? "medio" : "baixo";
  return { impacto, score };
}

/** ROAS acima do break-even com folga + perda relevante por orçamento —
 *  dinheiro rentável sendo deixado na mesa por falta de verba, não de
 *  qualidade do anúncio. */
export function identificarOportunidadeEscala(dados: DadosOportunidadeCampanha): Oportunidade | null {
  const L = LIMIARES_OPORTUNIDADE;
  if (dados.cliques < L.cliquesMinimos) return null;
  if (dados.roasAtual === null || dados.roasMinimo === null) return null;
  if (dados.roasAtual <= dados.roasMinimo * (1 + L.toleranciaBreakEven)) return null;
  if ((dados.lostImpressionShareByBudget ?? 0) <= L.perdaRelevante) return null;

  const estoqueOk = dados.estoqueDiasCobertura === null || dados.estoqueDiasCobertura >= L.estoqueDiasMinimoParaEscalar;
  const criterios = [
    `ROAS ${dados.roasAtual.toFixed(2)}x acima do mínimo sustentável (${dados.roasMinimo.toFixed(2)}x)`,
    `${((dados.lostImpressionShareByBudget ?? 0) * 100).toFixed(0)}% das impressões perdidas por orçamento`,
    dados.cvr !== null ? `CVR de ${(dados.cvr * 100).toFixed(2)}%` : "CVR sem amostra suficiente",
  ];
  if (!estoqueOk) criterios.push(`Estoque cobre só ${Math.round(dados.estoqueDiasCobertura!)} dias — considerar antes de escalar`);

  const { impacto, score } = scorePorImpacto(baseDeImpacto(dados), estoqueOk);

  return {
    tipo: "escala",
    campanhaId: dados.campanhaId,
    campanhaNome: dados.campanhaNome,
    titulo: "Rentável e limitada por orçamento",
    explicacao: `Esta campanha está rentável e perde ${((dados.lostImpressionShareByBudget ?? 0) * 100).toFixed(0)}% das oportunidades por orçamento.`,
    criterios,
    impacto,
    scoreImpacto: score,
  };
}

/** Campanha que já performou bem e deteriorou — "recuperação" porque o
 *  histórico prova que o patamar anterior era alcançável, não é uma
 *  aposta. Exige as duas janelas (atual e anterior) com ROAS conhecido. */
export function identificarOportunidadeRecuperacao(dados: DadosOportunidadeCampanha): Oportunidade | null {
  const L = LIMIARES_OPORTUNIDADE;
  if (dados.cliques < L.cliquesMinimos) return null;
  if (dados.roasAtual === null || dados.roasAnterior === null || dados.roasAnterior === 0) return null;

  const queda = (dados.roasAnterior - dados.roasAtual) / dados.roasAnterior;
  if (queda < L.quedaRoasRelevante) return null;

  const { impacto, score } = scorePorImpacto(baseDeImpacto(dados), true);

  return {
    tipo: "recuperacao",
    campanhaId: dados.campanhaId,
    campanhaNome: dados.campanhaNome,
    titulo: "ROAS caiu em relação ao período anterior",
    explicacao: `ROAS caiu de ${dados.roasAnterior.toFixed(2)}x para ${dados.roasAtual.toFixed(2)}x — queda de ${(queda * 100).toFixed(0)}%.`,
    criterios: [`ROAS anterior: ${dados.roasAnterior.toFixed(2)}x`, `ROAS atual: ${dados.roasAtual.toFixed(2)}x`],
    impacto,
    scoreImpacto: score,
  };
}

/** Perde exposição principalmente por RANKING, não por orçamento — o
 *  brief é explícito: aqui a recomendação não pode ser "aumentar verba". */
export function identificarOportunidadeRanking(dados: DadosOportunidadeCampanha): Oportunidade | null {
  const L = LIMIARES_OPORTUNIDADE;
  if (dados.cliques < L.cliquesMinimos) return null;
  const porRanking = dados.lostImpressionShareByAdRank ?? 0;
  const porOrcamento = dados.lostImpressionShareByBudget ?? 0;
  if (porRanking <= L.perdaRelevante) return null;
  if (porRanking <= porOrcamento) return null; // ranking precisa ser o gargalo principal

  const { impacto, score } = scorePorImpacto(baseDeImpacto(dados), true);

  return {
    tipo: "ranking",
    campanhaId: dados.campanhaId,
    campanhaNome: dados.campanhaNome,
    titulo: "O gargalo é ranking, não verba",
    explicacao: `${(porRanking * 100).toFixed(0)}% das impressões são perdidas por ranking (contra ${(porOrcamento * 100).toFixed(0)}% por orçamento) — o principal gargalo não é orçamento.`,
    criterios: [
      `Perda por ranking: ${(porRanking * 100).toFixed(0)}%`,
      `Perda por orçamento: ${(porOrcamento * 100).toFixed(0)}%`,
    ],
    impacto,
    scoreImpacto: score,
  };
}

/** Perde exposição principalmente por ORÇAMENTO, numa campanha já
 *  rentável — irmã da oportunidade de escala, mas com o recorte
 *  específico do brief ("mostrar impacto potencial como estimativa"). */
export function identificarOportunidadePorOrcamento(dados: DadosOportunidadeCampanha): Oportunidade | null {
  const L = LIMIARES_OPORTUNIDADE;
  if (dados.cliques < L.cliquesMinimos) return null;
  const porOrcamento = dados.lostImpressionShareByBudget ?? 0;
  const porRanking = dados.lostImpressionShareByAdRank ?? 0;
  if (porOrcamento <= L.perdaRelevante) return null;
  if (porOrcamento <= porRanking) return null;
  if (dados.roasAtual === null || dados.roasMinimo === null || dados.roasAtual <= dados.roasMinimo) return null;

  const { impacto, score } = scorePorImpacto(baseDeImpacto(dados), true);
  // Estimativa de gasto adicional possível: repor a fração perdida por
  // orçamento sobre o gasto atual. É projeção, não garantia — o brief pede
  // explicitamente para nunca apresentar isso como certeza.
  const gastoAdicionalEstimado = Math.round(dados.gastoAtual * (porOrcamento / (1 - porOrcamento)) * 100) / 100;

  return {
    tipo: "orcamento",
    campanhaId: dados.campanhaId,
    campanhaNome: dados.campanhaNome,
    titulo: "Campanha rentável limitada por orçamento",
    explicacao: `${(porOrcamento * 100).toFixed(0)}% das impressões perdidas por orçamento. Estimativa (não garantia): até R$ ${gastoAdicionalEstimado.toFixed(2)} a mais de investimento diário para capturar essa fatia.`,
    criterios: [`Perda por orçamento: ${(porOrcamento * 100).toFixed(0)}%`, `ROAS ${dados.roasAtual.toFixed(2)}x acima do mínimo (${dados.roasMinimo.toFixed(2)}x)`],
    impacto,
    scoreImpacto: score,
  };
}

/** Roda as quatro regras e devolve só o que de fato disparou, ordenado por
 *  score de impacto (maior primeiro) — a leitura da tela é "o que importa
 *  mais primeiro", não a ordem em que os dados chegaram. */
export function identificarOportunidades(
  dados: DadosOportunidadeCampanha,
): Oportunidade[] {
  const candidatas = [
    identificarOportunidadeEscala(dados),
    identificarOportunidadeRecuperacao(dados),
    identificarOportunidadeRanking(dados),
    identificarOportunidadePorOrcamento(dados),
  ];
  return candidatas
    .filter((item): item is Oportunidade => item !== null)
    .sort((a, b) => b.scoreImpacto - a.scoreImpacto);
}
