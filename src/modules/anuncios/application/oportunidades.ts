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
  roasAnterior: number | null;
  cvr: number | null;
  gastoAtual: number;
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
  perdaRelevante: 0.15,
  quedaRoasRelevante: 0.3, // 30% de queda
} as const;

/** Base do score: o gasto da campanha. Já foi "lucro estimado quando
 *  existe, senão o gasto" — o lucro dependia do custo do produto e nunca
 *  existiu, então o fallback era o único caminho vivo. */
function baseDeImpacto(dados: DadosOportunidadeCampanha): number {
  return dados.gastoAtual;
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

/* A oportunidade de "escala" vivia aqui e saiu com o break-even: ela abria
   exigindo `roasMinimo`, que vinha do custo do produto — nunca preenchido,
   então a regra jamais disparou. Chamar uma campanha de "rentável" exige
   saber o custo, e o sistema não sabe. */

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

/* A oportunidade "por orçamento" também saiu: além da perda por orçamento,
   ela exigia ROAS acima do mínimo sustentável para chamar a campanha de
   rentável — e esse mínimo vinha do custo. Sem ele, sobrava uma afirmação
   que o sistema não tem como sustentar. */

/** Roda as regras restantes e devolve só o que de fato disparou, ordenado
 *  por score de impacto (maior primeiro) — a leitura da tela é "o que
 *  importa mais primeiro", não a ordem em que os dados chegaram. */
export function identificarOportunidades(
  dados: DadosOportunidadeCampanha,
): Oportunidade[] {
  const candidatas = [
    identificarOportunidadeRecuperacao(dados),
    identificarOportunidadeRanking(dados),
  ];
  return candidatas
    .filter((item): item is Oportunidade => item !== null)
    .sort((a, b) => b.scoreImpacto - a.scoreImpacto);
}
