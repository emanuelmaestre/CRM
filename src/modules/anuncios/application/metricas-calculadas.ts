/* ── Métricas calculadas (Fase 2) ─────────────────────────────────
   Nada aqui vem do Mercado Livre — são funções puras sobre as métricas de
   Ads (Fase 1, `ads_campanha_snapshot`/`ads_anuncio_snapshot`). Puras de
   propósito: nenhuma consulta a banco, só matemática, o que torna isto
   testável com fixture.

   Este arquivo já teve dois motores a mais — "lucro real estimado" e
   "break-even" — removidos por decisão de produto: os dois dependiam do
   custo do produto, que nunca existiu no schema e nunca será preenchido.
   Com todo custo nulo, `break-even` devolvia `"indeterminado"` em 100% dos
   casos e o "lucro" era só receita menos investimento com um asterisco de
   "parcial" que jamais sumiria. Uma conta que só sabe dizer "não sei" não
   ajuda ninguém a decidir — Anúncios passa a falar exclusivamente a língua
   que o Mercado Livre entrega pronta: ROAS, ACOS, TACOS, CVR, CTR, CPC. */

/* ── Dependência de mídia ──────────────────────────────────────── */

export type ClassificacaoDependencia = "baixa" | "moderada" | "alta" | "critica";

export interface DependenciaMidia {
  /** 0–100. Null sem nenhuma venda (publicitária ou orgânica) no período. */
  percentual: number | null;
  classificacao: ClassificacaoDependencia | null;
}

/** Faixas nomeadas — ajustáveis sem caçar número mágico no meio da UI.
 *  Não existe corte "oficial" do Mercado Livre para isto; são as faixas
 *  que o próprio sistema usa para decidir o rótulo. */
const FAIXAS_DEPENDENCIA: Array<{ min: number; classificacao: ClassificacaoDependencia }> = [
  { min: 75, classificacao: "critica" },
  { min: 55, classificacao: "alta" },
  { min: 30, classificacao: "moderada" },
  { min: 0, classificacao: "baixa" },
];

/** Dependência alta não é automaticamente ruim — uma marca nova sem
 *  histórico orgânico pode depender 90% de mídia e estar saudável. A
 *  classificação é só o rótulo; o contexto (brief item 3) fica pra quem
 *  monta a UI decidir o texto ao lado. */
export function calcularDependenciaMidia(vendasPublicitarias: number, vendasTotais: number): DependenciaMidia {
  if (vendasTotais <= 0) return { percentual: null, classificacao: null };
  const percentual = Math.round((vendasPublicitarias / vendasTotais) * 1000) / 10;
  const faixa = FAIXAS_DEPENDENCIA.find((item) => percentual >= item.min) ?? FAIXAS_DEPENDENCIA[FAIXAS_DEPENDENCIA.length - 1];
  return { percentual, classificacao: faixa.classificacao };
}

/* ── Desperdício estimado ─────────────────────────────────────────
   "Desperdício" é uma acusação, não uma observação — por isso carrega
   critérios mínimos de amostra. Gasto baixo sem venda pode ser só sorte
   ruim de um dia; gasto alto e sustentado sem venda, com cliques
   suficientes para provar que houve interesse real, é outra história.

   Havia aqui um segundo motivo de sinalização, "abaixo do break-even",
   que saiu junto com o motor de break-even: sem custo do produto ele
   nunca teve um ROAS mínimo com que comparar. Sobra o critério que se
   sustenta sozinho — gastou e não vendeu. */

export const CRITERIOS_DESPERDICIO_PADRAO = {
  /** Cliques mínimos para o item entrar na análise — abaixo disso não há
   *  amostra que sustente a conclusão "não converte", só "poucos dados". */
  cliquesMinimos: 15,
  /** Gasto mínimo (R$) para o item entrar na análise por valor. */
  gastoMinimo: 30,
} as const;

export interface ItemAnalisadoDesperdicio {
  id: string;
  nome: string;
  cliques: number;
  gasto: number;
  vendas: number;
}

export interface DesperdicioEstimado {
  totalEmAtencao: number;
  itens: ItemAnalisadoDesperdicio[];
}

/** Só entra na lista quem passa da amostra mínima — item com poucos
 *  cliques e pouco gasto nunca é "desperdício", é "ainda não sabemos". */
export function calcularDesperdicio(
  itens: ItemAnalisadoDesperdicio[],
  criterios: { cliquesMinimos: number; gastoMinimo: number } = CRITERIOS_DESPERDICIO_PADRAO,
): DesperdicioEstimado {
  const sinalizados = itens.filter((item) => {
    const amostraSuficiente = item.cliques >= criterios.cliquesMinimos || item.gasto >= criterios.gastoMinimo;
    return amostraSuficiente && item.vendas === 0;
  });

  return {
    totalEmAtencao: Math.round(sinalizados.reduce((soma, item) => soma + item.gasto, 0) * 100) / 100,
    itens: sinalizados,
  };
}
