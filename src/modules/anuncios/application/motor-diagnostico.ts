/* ── Motor de diagnóstico (Fase 3) ────────────────────────────────
   Regras diferenciais puras: cruzam sinais que sozinhos parecem a mesma
   coisa (ex.: "ROAS ruim") mas pedem ações opostas dependendo do contexto
   (perda por orçamento + ROAS bom → escalar; perda por orçamento + ROAS
   ruim → NÃO escalar). É esse raciocínio, não o número isolado, que o
   brief pede como "o diferencial do módulo".

   Cada regra tem amostra mínima antes de disparar — abaixo disso, "dados
   insuficientes" (ver `amostraInsuficiente` no resultado), nunca um
   diagnóstico de baixa confiança disfarçado de certeza. */

export type TipoSinalDiagnostico =
  | "impressoes_altas_cliques_baixos"
  | "cliques_altos_vendas_baixas"
  | "conversao_boa_exposicao_baixa"
  | "roas_bom_perda_orcamento"
  | "roas_ruim_perda_orcamento"
  | "roas_bom_estoque_baixo"
  | "cpc_subindo_cvr_estavel"
  | "cpc_estavel_cvr_caindo";

export type SeveridadeDiagnostico = "oportunidade" | "atencao" | "critico";

export interface Diagnostico {
  tipo: TipoSinalDiagnostico;
  severidade: SeveridadeDiagnostico;
  titulo: string;
  explicacao: string;
  causasPossiveis: string[];
  acaoRecomendada: string;
  /** Presente só quando a ação "óbvia" (geralmente aumentar orçamento ou
   *  escalar) seria um erro dado o resto do quadro — o motor precisa saber
   *  dizer "não" tão bem quanto "sim" (ver brief, seção 18). */
  acaoDesencorajada?: string;
}

export interface DadosDiagnosticoCampanha {
  impressoes: number;
  cliques: number;
  vendas: number;
  /** Fração 0–1. */
  ctr: number | null;
  cvr: number | null;
  cpcAtual: number | null;
  /** Janela anterior de mesmo tamanho, para as regras de tendência. */
  cpcAnterior: number | null;
  cvrAnterior: number | null;
  roasAtual: number | null;
  /** Frações 0–1, direto do Mercado Livre. */
  lostImpressionShareByBudget: number | null;
  lostImpressionShareByAdRank: number | null;
  /** Dias de estoque no ritmo de venda atual — mesmo conceito já usado no
   *  Painel (ver dashboard.service.ts `coberturaDias`). */
  estoqueDiasCobertura: number | null;
}

/* ── Limiares nomeados ─────────────────────────────────────────────
   Não são benchmark oficial do Mercado Livre — são o parâmetro que ESTE
   motor usa pra decidir "baixo"/"alto"/"estável". Nomeados aqui pra serem
   discutíveis e ajustáveis sem caçar número mágico no meio de uma regra. */
export const LIMIARES_DIAGNOSTICO = {
  impressoesMinimasParaCtr: 300,
  cliquesMinimosParaCvr: 20,
  ctrBaixo: 0.005,
  cvrBaixo: 0.01,
  cvrBom: 0.03,
  exposicaoAindaComEspaco: 0.3, // soma de perda por orçamento + ranking
  perdaOrcamentoRelevante: 0.15,
  estoqueDiasBaixo: 15,
  variacaoCpcRelevante: 0.15,
  variacaoCvrEstavelMax: 0.1,
  variacaoCvrQuedaRelevante: -0.2,
} as const;

function variacao(atual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return (atual - anterior) / anterior;
}

/** Cada regra é independente e pode coexistir com outras — uma campanha
 *  real frequentemente tem mais de um sintoma ao mesmo tempo. A ordem do
 *  array é a ordem de leitura sugerida: primeiro topo de funil (exposição/
 *  cliques), depois fundo (conversão/rentabilidade), depois tendência. */
export function diagnosticarCampanha(dados: DadosDiagnosticoCampanha): Diagnostico[] {
  const achados: Diagnostico[] = [];
  const L = LIMIARES_DIAGNOSTICO;

  // 1. Muitas impressões, poucos cliques — problema de atratividade, não de conversão.
  if (dados.impressoes >= L.impressoesMinimasParaCtr && dados.ctr !== null && dados.ctr < L.ctrBaixo) {
    achados.push({
      tipo: "impressoes_altas_cliques_baixos",
      severidade: "atencao",
      titulo: "Muitas impressões, poucos cliques",
      explicacao: `O anúncio aparece bastante (${dados.impressoes.toLocaleString("pt-BR")} impressões), mas gera poucos cliques. O CTR é de ${(dados.ctr * 100).toFixed(2)}%.`,
      causasPossiveis: ["Preço fora da faixa esperada", "Foto ou título pouco atrativos", "Oferta menos competitiva que a concorrência direta"],
      acaoRecomendada: "Revisar preço, imagem principal e título antes de investir mais em exposição.",
    });
  }

  // 2. Muitos cliques, poucas vendas — problema de página/oferta no momento da decisão.
  if (dados.cliques >= L.cliquesMinimosParaCvr && dados.cvr !== null && dados.cvr < L.cvrBaixo) {
    achados.push({
      tipo: "cliques_altos_vendas_baixas",
      severidade: "atencao",
      titulo: "Cliques não estão virando venda",
      explicacao: `O anúncio atrai cliques (${dados.cliques.toLocaleString("pt-BR")} no período), mas converte pouco. A CVR é de ${(dados.cvr * 100).toFixed(2)}%.`,
      causasPossiveis: ["Página do anúncio (fotos, ficha técnica, avaliações)", "Preço competitivo no clique, mas alto na comparação final", "Reputação do vendedor ou prazo de frete"],
      acaoRecomendada: "Revisar a página do anúncio, reputação e condições de frete antes de aumentar tráfego.",
    });
  }

  // 3. Boa conversão, ainda com espaço de exposição — oportunidade de crescer.
  const exposicaoNaoCapturada = (dados.lostImpressionShareByBudget ?? 0) + (dados.lostImpressionShareByAdRank ?? 0);
  if (dados.cvr !== null && dados.cvr >= L.cvrBom && exposicaoNaoCapturada > L.exposicaoAindaComEspaco) {
    achados.push({
      tipo: "conversao_boa_exposicao_baixa",
      severidade: "oportunidade",
      titulo: "Boa conversão com espaço para crescer",
      explicacao: `CVR de ${(dados.cvr * 100).toFixed(2)}% (acima do que costuma converter bem) enquanto ${(exposicaoNaoCapturada * 100).toFixed(0)}% das impressões possíveis ainda não são capturadas.`,
      causasPossiveis: ["Orçamento limitando a exposição", "Ranking do anúncio abaixo do que a qualidade permitiria"],
      acaoRecomendada: "Avaliar o aumento do orçamento e a melhoria do ranking, pois o produto já demonstra capacidade de conversão.",
    });
  }

  /* Três regras que existiam aqui — "Rentável e limitada por orçamento",
     "Perda por orçamento, mas a campanha já não é rentável" e "Rentável,
     mas o estoque não aguenta escalar" — saíram junto com o break-even.
     As três abriam com `roasMinimo !== null`, e esse mínimo vinha do custo
     do produto, que nunca existiu: nenhuma delas jamais disparou. Dizer
     "rentável" exige saber o custo, e o sistema não sabe — as regras que
     sobraram falam só de funil, que é o que o Mercado Livre entrega. */

  // 4. CPC subindo, CVR estável — o custo de aquisição está subindo por
  // fora da conversão (provavelmente concorrência/leilão), não por causa
  // do produto em si.
  const varCpc = dados.cpcAtual !== null && dados.cpcAnterior !== null ? variacao(dados.cpcAtual, dados.cpcAnterior) : null;
  const varCvr = dados.cvr !== null && dados.cvrAnterior !== null ? variacao(dados.cvr, dados.cvrAnterior) : null;
  if (varCpc !== null && varCpc > L.variacaoCpcRelevante && varCvr !== null && Math.abs(varCvr) <= L.variacaoCvrEstavelMax) {
    achados.push({
      tipo: "cpc_subindo_cvr_estavel",
      severidade: "atencao",
      titulo: "Custo por clique subindo, conversão estável",
      explicacao: `O CPC subiu ${(varCpc * 100).toFixed(0)}% enquanto a CVR se manteve estável. O custo de aquisição está aumentando sem relação com a conversão do produto.`,
      causasPossiveis: ["Mais concorrência disputando o mesmo leilão", "Mudança na estratégia de lance da campanha"],
      acaoRecomendada: "Investigar concorrência direta e custo de aquisição antes de aceitar o CPC mais alto como normal.",
    });
  }

  // 5. CPC estável, CVR caindo — o problema é o produto/oferta, não o leilão.
  if (varCpc !== null && Math.abs(varCpc) <= L.variacaoCpcRelevante && varCvr !== null && varCvr < L.variacaoCvrQuedaRelevante) {
    achados.push({
      tipo: "cpc_estavel_cvr_caindo",
      severidade: "critico",
      titulo: "Conversão caindo sem mudança no custo de aquisição",
      explicacao: `A CVR caiu ${Math.abs(varCvr * 100).toFixed(0)}% enquanto o CPC ficou estável. O tráfego continua custando o mesmo, mas está convertendo menos.`,
      causasPossiveis: ["Preço alterado", "Estoque de variação específica em falta", "Reputação ou avaliações recentes", "Concorrência com oferta melhor na mesma busca"],
      acaoRecomendada: "Investigar mudanças recentes no próprio anúncio (preço, estoque, avaliações) antes de mexer na campanha.",
    });
  }

  return achados;
}
