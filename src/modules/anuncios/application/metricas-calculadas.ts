/* ── Métricas calculadas (Fase 2) ─────────────────────────────────
   Nada aqui vem do Mercado Livre — são funções puras que cruzam métricas
   de Ads (Fase 1, `ads_campanha_snapshot`/`ads_anuncio_snapshot`) com
   custo/margem do nosso próprio sistema. Puras de propósito: nenhuma
   consulta a banco aqui, só matemática — o que torna isto testável com
   fixture, sem precisar de dado real do Mercado Livre ainda (a conta
   ainda não tem Publicidade habilitada, ver Fase 1).

   Regra que atravessa o arquivo inteiro: custo ausente não vira zero.
   `produto.custo` não existe no schema hoje (removido num refactor
   anterior) — então "Lucro Real" quase sempre vai nascer parcial. Isso é
   esperado, não um bug: o valor sai marcado como incompleto, com a lista
   exata do que falta, em vez de fingir precisão que não existe. */

/* ── Lucro real estimado ──────────────────────────────────────── */

export interface CustosConhecidos {
  /** Custo do produto por unidade vendida. Null = não configurado no
   *  catálogo (produto.custo não existe hoje — ver nota do arquivo). */
  custoProdutoUnitario: number | null;
  /** Comissão do marketplace, em R$ totais (não percentual) — já vem
   *  calculada por `margem.service.ts` a partir de `sale_fee` real, quando
   *  disponível para o período. */
  comissaoMarketplace: number | null;
  impostos: number | null;
  frete: number | null;
  descontos: number | null;
  /** Custos extras configuráveis (embalagem, taxa de plataforma etc.). */
  outros: number | null;
}

export const CUSTOS_VAZIOS: CustosConhecidos = {
  custoProdutoUnitario: null,
  comissaoMarketplace: null,
  impostos: null,
  frete: null,
  descontos: null,
  outros: null,
};

const CAMPO_LABEL: Record<Exclude<keyof CustosConhecidos, never>, string> = {
  custoProdutoUnitario: "custo do produto",
  comissaoMarketplace: "comissão do marketplace",
  impostos: "impostos",
  frete: "frete",
  descontos: "descontos",
  outros: "outros custos",
};

export interface LucroRealEstimado {
  receitaAtribuida: number;
  custoPublicitario: number;
  /** Soma só dos custos que têm valor conhecido — nunca trata ausência como
   *  zero, então este número já é, por construção, um piso otimista
   *  quando `custosAusentes` não está vazio. */
  custosOperacionaisConhecidos: number;
  lucroEstimado: number;
  /** Null quando receita é zero — não dá pra calcular margem sobre nada. */
  margemPercentual: number | null;
  /** Verdadeiro sempre que pelo menos um custo não está configurado. A UI
   *  usa isto para nunca mostrar "Lucro" sozinho, sempre com o aviso ao
   *  lado (ver brief: "Lucro estimado — existem custos ainda não
   *  configurados."). */
  custosIncompletos: boolean;
  custosAusentes: string[];
}

/** Receita menos os custos conhecidos, menos o custo publicitário. Cada
 *  custo ausente sai da soma (não vira zero) — o resultado não é "lucro
 *  contábil", é uma estimativa sobre o que já sabemos, e diz isso na cara. */
export function calcularLucroReal(
  receitaAtribuida: number,
  custoPublicitario: number,
  unidadesVendidas: number,
  custos: CustosConhecidos,
): LucroRealEstimado {
  const custoProdutoTotal = custos.custoProdutoUnitario !== null
    ? custos.custoProdutoUnitario * unidadesVendidas
    : null;

  const componentes: Array<[keyof CustosConhecidos, number | null]> = [
    ["custoProdutoUnitario", custoProdutoTotal],
    ["comissaoMarketplace", custos.comissaoMarketplace],
    ["impostos", custos.impostos],
    ["frete", custos.frete],
    ["descontos", custos.descontos],
    ["outros", custos.outros],
  ];

  const custosAusentes = componentes
    .filter(([, valor]) => valor === null)
    .map(([chave]) => CAMPO_LABEL[chave]);

  const custosOperacionaisConhecidos = componentes.reduce(
    (soma, [, valor]) => soma + (valor ?? 0),
    0,
  );

  const lucroEstimado = receitaAtribuida - custosOperacionaisConhecidos - custoPublicitario;

  return {
    receitaAtribuida,
    custoPublicitario,
    custosOperacionaisConhecidos,
    lucroEstimado,
    margemPercentual: receitaAtribuida > 0 ? Math.round((lucroEstimado / receitaAtribuida) * 1000) / 10 : null,
    custosIncompletos: custosAusentes.length > 0,
    custosAusentes,
  };
}

/* ── Break-even ────────────────────────────────────────────────── */

export type StatusBreakEven = "rentavel" | "no_limite" | "nao_rentavel" | "indeterminado";

export interface BreakEven {
  /** Margem de contribuição: quanto da receita sobra depois dos custos
   *  operacionais (sem mídia), em fração 0–1. Null sem custo conhecido —
   *  sem isso não existe break-even calculável, só ROAS/ACOS "no vácuo". */
  margemContribuicao: number | null;
  /** ROAS abaixo do qual a campanha dá prejuízo, dado o que já se gasta em
   *  produto/comissão/frete/impostos. */
  roasMinimo: number | null;
  /** ACOS acima do qual a campanha dá prejuízo — mesma conta, outro nome. */
  acosMaximo: number | null;
  roasAtual: number | null;
  status: StatusBreakEven;
}

/** Zona de "no limite": dentro de 10% do break-even pra cima ou pra baixo
 *  ainda conta como zona de risco, não "rentável" com folga nem "prejuízo"
 *  categórico — é a diferença entre "está bem" e "está bem, mas raspando". */
const MARGEM_ZONA_LIMITE = 0.1;

export function calcularBreakEven(
  receitaAtribuida: number,
  custoPublicitario: number,
  custos: Omit<CustosConhecidos, "outros"> & { unidadesVendidas: number },
): BreakEven {
  const custoProdutoTotal = custos.custoProdutoUnitario !== null
    ? custos.custoProdutoUnitario * custos.unidadesVendidas
    : null;

  const componentesConhecidos = [custoProdutoTotal, custos.comissaoMarketplace, custos.impostos, custos.frete, custos.descontos];
  const algumDesconhecido = componentesConhecidos.some((valor) => valor === null);

  const roasAtual = custoPublicitario > 0 ? Math.round((receitaAtribuida / custoPublicitario) * 100) / 100 : null;

  if (algumDesconhecido || receitaAtribuida <= 0) {
    return { margemContribuicao: null, roasMinimo: null, acosMaximo: null, roasAtual, status: "indeterminado" };
  }

  const custosOperacionais = componentesConhecidos.reduce<number>((soma, valor) => soma + (valor as number), 0);
  const margemContribuicao = (receitaAtribuida - custosOperacionais) / receitaAtribuida;

  // Margem de contribuição negativa ou zero: o produto já dá prejuízo antes
  // de qualquer mídia — nenhum ROAS salva isso, então não há "mínimo" que
  // faça sentido reportar como número finito.
  if (margemContribuicao <= 0) {
    return { margemContribuicao, roasMinimo: null, acosMaximo: null, roasAtual, status: "nao_rentavel" };
  }

  const roasMinimo = Math.round((1 / margemContribuicao) * 100) / 100;
  const acosMaximo = Math.round(margemContribuicao * 1000) / 10;

  let status: StatusBreakEven = "indeterminado";
  if (roasAtual !== null) {
    const razao = roasAtual / roasMinimo;
    status = razao < 1 - MARGEM_ZONA_LIMITE ? "nao_rentavel"
      : razao > 1 + MARGEM_ZONA_LIMITE ? "rentavel"
      : "no_limite";
  }

  return { margemContribuicao, roasMinimo, acosMaximo, roasAtual, status };
}

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
   suficientes para provar que houve interesse real, é outra história. */

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
  /** Break-even já calculado para este item, se houver custo configurado. */
  roasMinimo: number | null;
  roasAtual: number | null;
}

export interface ItemDesperdicio extends ItemAnalisadoDesperdicio {
  motivo: "sem_conversao" | "abaixo_do_breakeven";
}

export interface DesperdicioEstimado {
  totalEmAtencao: number;
  itens: ItemDesperdicio[];
}

/** Só entra na lista quem passa da amostra mínima — item com poucos
 *  cliques e pouco gasto nunca é "desperdício", é "ainda não sabemos". */
export function calcularDesperdicio(
  itens: ItemAnalisadoDesperdicio[],
  criterios: { cliquesMinimos: number; gastoMinimo: number } = CRITERIOS_DESPERDICIO_PADRAO,
): DesperdicioEstimado {
  const sinalizados: ItemDesperdicio[] = [];

  for (const item of itens) {
    const amostraSuficiente = item.cliques >= criterios.cliquesMinimos || item.gasto >= criterios.gastoMinimo;
    if (!amostraSuficiente) continue;

    if (item.vendas === 0) {
      sinalizados.push({ ...item, motivo: "sem_conversao" });
      continue;
    }

    if (item.roasMinimo !== null && item.roasAtual !== null && item.roasAtual < item.roasMinimo) {
      sinalizados.push({ ...item, motivo: "abaixo_do_breakeven" });
    }
  }

  return {
    totalEmAtencao: Math.round(sinalizados.reduce((soma, item) => soma + item.gasto, 0) * 100) / 100,
    itens: sinalizados,
  };
}
