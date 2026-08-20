"use client";

import { motion, useReducedMotion } from "framer-motion";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { VisaoGeralResumo } from "@/modules/anuncios/application/visao-geral.service";
import { springs, fadeUp } from "@/shared/design-system/motion-variants";
import anunciosConfig from "@/config/anuncios.json";
import { RotuloComInfo, useContagem } from "./anuncios-primitives";
import { COR_ROAS, SetaRoas, situacaoRoas } from "./roas";
import { tint } from "@/shared/design-system/color";

const copy = anunciosConfig.kpis;
const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const inteiro = new Intl.NumberFormat("pt-BR");
const decimal1 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const decimal2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percentual = (valor: number) => `${decimal1.format(valor)}%`;
const roasTexto = (valor: number) => `${decimal2.format(valor)}x`;

function descricaoReceita(resumo: VisaoGeralResumo) {
  const valor = moeda.format(resumo.receitaTotal);
  const vendas = Math.max(0, resumo.vendas);
  const ticketMedio = vendas > 0 ? resumo.receitaTotal / vendas : null;
  let leitura: string;

  if (resumo.receitaTotal <= 0) {
    leitura = `Receita atribuída atual: ${valor}. Neste período, a plataforma não atribuiu vendas aos anúncios, então o retorno da mídia aparece zerado.`;
  } else if (ticketMedio !== null) {
    const vendasTexto = vendas === 1 ? "1 venda atribuída aos anúncios" : `${inteiro.format(vendas)} vendas atribuídas aos anúncios`;
    leitura = `Receita atribuída atual: ${valor}. A plataforma associou esse faturamento a ${vendasTexto}, com média de ${moeda.format(ticketMedio)} por venda.`;
  } else {
    leitura = `Receita atribuída atual: ${valor}. A plataforma associou esse faturamento aos anúncios, mas não informou quantidade de vendas para calcular o ticket médio.`;
  }

  return {
    descricao: `${leitura} Use este valor para medir ROAS, ACOS e retorno da mídia paga.`,
    observacao: "Receita, nesta tela, é o valor total vendido que a plataforma atribuiu aos anúncios. Não é lucro: ainda não desconta investimento em mídia, custo do produto, taxas, frete ou impostos.",
  };
}

function descricaoRoas(valor: number | null) {
  if (valor === null) {
    return "Sem investimento no período, o ROAS fica sem dado. Ele só existe quando há gasto em anúncios para comparar com a receita atribuída.";
  }

  const explicacao = `ROAS atual: ${roasTexto(valor)}. ROAS é a receita atribuída dividida pelo investimento em anúncios. Neste período, cada ${moeda.format(1)} investido voltou como ${moeda.format(valor)} em receita atribuída.`;

  if (valor < 1) {
    return `${explicacao} Como está abaixo de 1,00x, a mídia ainda não se pagou.`;
  }

  if (valor === 1) {
    return `${explicacao} Em 1,00x, a mídia apenas empatou: recuperou o investimento, mas ainda não gerou retorno acima dele.`;
  }

  return `${explicacao} Como está acima de 1,00x, a mídia se pagou; quanto maior o ROAS, melhor o retorno.`;
}

function descricaoAcos(resumo: VisaoGeralResumo) {
  const observacao = "ACOS olha só a receita atribuída aos anúncios. TACOS olha a receita total, somando ads e orgânico. ACOS baixo ajuda na eficiência, mas não é lucro: ainda não desconta custo do produto, taxas, frete ou impostos.";

  if (resumo.acosMedio === null || resumo.receitaTotal <= 0) {
    return {
      descricao: "Sem receita atribuída no período, o ACOS fica sem dado. Ele precisa de receita gerada pelos anúncios para comparar com o investimento em mídia.",
      observacao,
    };
  }

  let leitura: string;

  if (resumo.acosMedio <= 15) {
    leitura = "Esse peso está baixo: a mídia consumiu uma fatia pequena da receita atribuída.";
  } else if (resumo.acosMedio <= 30) {
    leitura = "Esse peso está em faixa intermediária. Pode ser saudável, mas depende da margem real dos produtos.";
  } else {
    leitura = "Esse peso está alto: uma parte grande da receita atribuída está sendo consumida pela mídia.";
  }

  return {
    descricao: `ACOS atual: ${percentual(resumo.acosMedio)}. ACOS é investimento em anúncios dividido pela receita atribuída: ${moeda.format(resumo.investimentoTotal)} de mídia sobre ${moeda.format(resumo.receitaTotal)} de receita atribuída. Isso significa que, a cada ${moeda.format(100)} de receita atribuída, ${moeda.format(resumo.acosMedio)} foram consumidos por mídia. ${leitura}`,
    observacao,
  };
}

function descricaoTacos(resumo: VisaoGeralResumo) {
  const receitaTotal = resumo.receitaTotal + resumo.receitaOrganica;
  const observacao = "TACOS olha o peso da mídia no negócio inteiro. Diferente do ACOS, ele usa receita total: anúncios mais orgânico. Ainda assim, não é lucro nem margem.";

  if (resumo.tacos === null || receitaTotal <= 0) {
    return {
      descricao: "Sem receita total no período, o TACOS fica sem dado. Ele precisa de vendas pagas e/ou orgânicas para comparar com o investimento em mídia.",
      observacao,
    };
  }

  let leitura: string;

  if (resumo.tacos <= 10) {
    leitura = "Esse peso está baixo: a mídia representa uma fatia pequena da receita total.";
  } else if (resumo.tacos <= 20) {
    leitura = "Esse peso está em faixa de atenção saudável: a mídia tem impacto relevante, mas ainda não domina a receita total.";
  } else {
    leitura = "Esse peso está alto: a operação está mais dependente de mídia paga para gerar receita total.";
  }

  return {
    descricao: `TACOS atual: ${percentual(resumo.tacos)}. TACOS é investimento em anúncios dividido pela receita total: ${moeda.format(resumo.investimentoTotal)} de mídia sobre ${moeda.format(receitaTotal)} de receita total (${moeda.format(resumo.receitaTotal)} de ads + ${moeda.format(resumo.receitaOrganica)} orgânica). Isso significa que, a cada ${moeda.format(100)} vendidos no total, ${moeda.format(resumo.tacos)} vieram como peso de mídia. ${leitura}`,
    observacao,
  };
}

function descricaoVendas(resumo: VisaoGeralResumo) {
  const vendas = Math.max(0, resumo.vendas);

  if (vendas === 0) {
    return {
      descricao: "Vendas atribuídas atual: 0. Nenhuma compra foi associada aos anúncios neste período. Quando isso acontece, conversão, receita atribuída e ROAS tendem a ficar sem força.",
      observacao: "Atribuída não quer dizer que o anúncio foi o único motivo da compra. Quer dizer que, pelas regras da plataforma, essa venda entrou na conta da mídia.",
    };
  }

  const vendasTexto = vendas === 1 ? "1 venda atribuída" : `${inteiro.format(vendas)} vendas atribuídas`;
  const leituraConversao = resumo.cliques > 0 && resumo.cvrMedio !== null
    ? ` Com ${inteiro.format(resumo.cliques)} cliques, isso representa CVR de ${percentual(resumo.cvrMedio)}.`
    : "";

  return {
    descricao: `Vendas atribuídas atual: ${inteiro.format(vendas)}. São ${vendasTexto} que a plataforma conectou aos anúncios no período.${leituraConversao} Use junto com Receita atribuída e ROAS para entender se o tráfego virou venda real.`,
    observacao: "Atribuída não quer dizer que o anúncio foi o único motivo da compra. Quer dizer que, pelas regras da plataforma, essa venda entrou na conta da mídia.",
  };
}

function descricaoCvr(resumo: VisaoGeralResumo) {
  const observacao = "Clique é a visita gerada pelo anúncio. Conversão é quando esse clique vira venda atribuída. CVR não mede custo nem receita; ele mede a qualidade do tráfego depois do clique.";

  if (resumo.cvrMedio === null || resumo.cliques <= 0) {
    return {
      descricao: "Sem cliques no período, o CVR fica sem dado. Ele só existe quando há visitas geradas por anúncio para comparar com as vendas atribuídas.",
      observacao,
    };
  }

  const vendas = Math.max(0, resumo.vendas);
  let leitura: string;

  if (vendas === 0 || resumo.cvrMedio === 0) {
    leitura = "Os cliques ainda não estão virando venda atribuída. Vale revisar página do produto, preço, oferta e qualidade do público.";
  } else if (resumo.cvrMedio < 1) {
    leitura = "A conversão está baixa: muita gente clica, mas pouca gente compra. O gargalo pode estar depois do clique.";
  } else if (resumo.cvrMedio < 3) {
    leitura = "A conversão está em faixa moderada. Compare com CPC e ROAS para saber se o custo do tráfego ainda compensa.";
  } else {
    leitura = "A conversão mostra bom sinal: uma parte relevante dos cliques está virando venda. Depois confirme o retorno olhando ROAS e ACOS.";
  }

  return {
    descricao: `CVR atual: ${percentual(resumo.cvrMedio)}. CVR é vendas atribuídas divididas pelos cliques: ${inteiro.format(vendas)} vendas a partir de ${inteiro.format(resumo.cliques)} cliques. Isso equivale a cerca de ${decimal1.format(resumo.cvrMedio)} vendas a cada 100 cliques. ${leitura}`,
    observacao,
  };
}

function descricaoCtr(resumo: VisaoGeralResumo) {
  const observacao = "Impressão é cada vez que o anúncio apareceu para alguém. Clique é quando a pessoa demonstrou interesse e entrou no anúncio. CTR não mede venda; ele mede o interesse inicial gerado pela vitrine.";

  if (resumo.ctrMedio === null || resumo.impressoes <= 0) {
    return {
      descricao: "Sem impressões no período, o CTR fica sem dado. Ele só existe quando há exibições do anúncio para comparar com os cliques.",
      observacao,
    };
  }

  const cliquesPorMil = (resumo.cliques / resumo.impressoes) * 1000;
  let leitura: string;

  if (resumo.ctrMedio < 0.5) {
    leitura = "Como está abaixo de 0,5%, muita gente viu o anúncio, mas pouca gente clicou. Vale revisar criativo, oferta, título ou público.";
  } else if (resumo.ctrMedio < 1.5) {
    leitura = "Esse nível mostra interesse moderado. O anúncio está gerando cliques, mas ainda pode melhorar criativo, oferta ou segmentação.";
  } else {
    leitura = "Esse nível mostra bom sinal de interesse. Depois, olhe CVR e ROAS para confirmar se esses cliques estão virando venda com retorno.";
  }

  return {
    descricao: `CTR atual: ${percentual(resumo.ctrMedio)}. CTR é cliques divididos por impressões: de ${inteiro.format(resumo.impressoes)} exibições, ${inteiro.format(resumo.cliques)} viraram clique. Isso equivale a cerca de ${decimal1.format(cliquesPorMil)} cliques a cada 1.000 impressões. ${leitura}`,
    observacao,
  };
}

function descricaoCpc(resumo: VisaoGeralResumo) {
  const observacao = "Clique não é venda. CPC mostra quanto custou trazer uma visita pelo anúncio; depois, CVR, Receita atribuída e ROAS mostram se essa visita virou resultado.";

  if (resumo.cpcMedio === null || resumo.cliques <= 0) {
    return {
      descricao: "Sem cliques no período, o CPC médio fica sem dado. Ele só existe quando há visitas geradas por anúncio para dividir o investimento.",
      observacao,
    };
  }

  let leitura: string;

  if (resumo.investimentoTotal <= 0) {
    leitura = "Como não houve investimento registrado, o custo por clique aparece zerado ou sem peso financeiro neste período.";
  } else if (resumo.cpcMedio <= 1) {
    leitura = "Esse custo por clique está baixo; depois confira se os cliques têm qualidade olhando CVR e ROAS.";
  } else if (resumo.cpcMedio <= 3) {
    leitura = "Esse custo por clique está em uma faixa intermediária. A qualidade depende de quantos desses cliques viram venda.";
  } else {
    leitura = "Esse custo por clique está alto. Para fazer sentido, esses cliques precisam converter bem e gerar ROAS saudável.";
  }

  return {
    descricao: `CPC médio atual: ${moeda.format(resumo.cpcMedio)}. CPC é o investimento em anúncios dividido pelos cliques: ${moeda.format(resumo.investimentoTotal)} dividido por ${inteiro.format(resumo.cliques)} cliques. Em média, cada visita gerada pelo anúncio custou ${moeda.format(resumo.cpcMedio)}. ${leitura}`,
    observacao,
  };
}

function descricaoKpi(resumo: VisaoGeralResumo) {
  const receita = descricaoReceita(resumo);
  const acos = descricaoAcos(resumo);
  const tacos = descricaoTacos(resumo);
  const vendas = descricaoVendas(resumo);
  const cvr = descricaoCvr(resumo);
  const ctr = descricaoCtr(resumo);
  const cpc = descricaoCpc(resumo);

  return {
    investimento: `Neste período, a marca investiu ${moeda.format(resumo.investimentoTotal)} em anúncios. Esse gasto entra nos cálculos de ROAS, ACOS, TACOS e CPC.`,
    receita: receita.descricao,
    receitaObservacao: receita.observacao,
    roas: descricaoRoas(resumo.roasMedio),
    acos: acos.descricao,
    acosObservacao: acos.observacao,
    tacos: tacos.descricao,
    tacosObservacao: tacos.observacao,
    cvr: cvr.descricao,
    cvrObservacao: cvr.observacao,
    ctr: ctr.descricao,
    ctrObservacao: ctr.observacao,
    cpc: cpc.descricao,
    cpcObservacao: cpc.observacao,
    impressoes: `Os anúncios apareceram ${inteiro.format(resumo.impressoes)} vezes no período. Use junto com CTR para saber se a vitrine está gerando interesse.`,
    cliques: `Os anúncios receberam ${inteiro.format(resumo.cliques)} cliques. Compare com impressões (CTR) e vendas (CVR) para entender onde o funil perde força.`,
    vendas: vendas.descricao,
    vendasObservacao: vendas.observacao,
  };
}

/* ── Hierarquia de KPIs ────────────────────────────────────────
   Primeira linha: os 4 números que respondem "o que está acontecendo"
   em 10 segundos (brief, seção "Princípio central"). Segunda linha:
   métricas secundárias, menores, mesma leitura mas sem competir com as
   primárias por atenção. Nada de 15 cards iguais. */

function NumeroGrande({ label, descricao, observacao, valor, formatar, cor, sufixo, prefixo, destaque = false }: {
  label: string;
  descricao: string;
  observacao?: string;
  valor: number | null;
  formatar: (n: number) => string;
  cor?: string;
  sufixo?: React.ReactNode;
  /** Ícone antes do número — usado pelo ROAS, que sem ele dependeria só de cor. */
  prefixo?: React.ReactNode;
  destaque?: boolean;
}) {
  const animado = useContagem(valor ?? 0);
  return (
    <motion.div variants={fadeUp} className="min-w-0">
      <p className={`${destaque ? "[font-family:var(--font-sora)] text-[21px] leading-[26px] font-bold tracking-[-0.02em] sm:text-stat-lg" : "text-[22px] font-bold leading-none"} flex items-center gap-1 tabular-nums`} style={cor ? { color: cor } : undefined}>
        {valor !== null && prefixo}
        {valor === null ? "Sem dado" : formatar(animado)}
      </p>
      <p className="mt-1.5 text-xs font-medium text-muted-foreground">
        <RotuloComInfo descricao={descricao} observacao={observacao}>{label}</RotuloComInfo>
      </p>
      {sufixo}
    </motion.div>
  );
}

export function KpisPrincipais({ resumo }: { resumo: VisaoGeralResumo }) {
  const infoKpi = descricaoKpi(resumo);

  return (
    <div className="card-surface p-5">
      {/* Linha 1 — os três números que importam primeiro. Havia um quarto,
          "Lucro após publicidade", removido junto com o motor de custo: ele
          era receita menos investimento com um selo de "estimativa parcial"
          que nunca sairia, porque o custo do produto nunca existiu. */}
      {/* Investimento/Receita lado a lado no mobile (cabiam, mas ficavam
          empilhados ocupando só a metade esquerda do card, com a direita
          vazia) — ROAS ganha a linha de baixo pra si, já que tem tratamento
          visual próprio (seta + cor) e merece não competir por coluna. */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 sm:gap-6">
        <NumeroGrande label={copy.investimento} descricao={infoKpi.investimento} valor={resumo.investimentoTotal} formatar={(n) => moeda.format(n)} destaque />
        <NumeroGrande label={copy.receita} descricao={infoKpi.receita} observacao={infoKpi.receitaObservacao} valor={resumo.receitaTotal} formatar={(n) => moeda.format(n)} destaque />
        {/* Único KPI com seta: os outros três são dinheiro, e o sinal de menos
            já diferencia sem depender de cor. ROAS não tem sinal. */}
        <div className="col-span-2 sm:col-span-1">
          <NumeroGrande
            label={copy.roas}
            descricao={infoKpi.roas}
            valor={resumo.roasMedio}
            formatar={(n) => `${n.toFixed(2)}x`}
            destaque
            cor={COR_ROAS[situacaoRoas(resumo.roasMedio)]}
            prefixo={<SetaRoas situacao={situacaoRoas(resumo.roasMedio)} />}
          />
        </div>
      </div>

      {/* Linha 2 — secundárias, visualmente menores */}
      <motion.div
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04, delayChildren: 0.1 } } }}
        // 8 numa linha só cabia com rótulo de sigla crua (ROAS, ACOS...); com
        // a explicação entre parênteses, precisa do dobro da largura por
        // célula — 4 colunas (2 linhas) em vez de 8 (1 linha espremida).
        className="mt-6 grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4"
      >
        <Secundaria label={copy.acos} descricao={infoKpi.acos} observacao={infoKpi.acosObservacao} valor={resumo.acosMedio} formatar={(n) => `${n.toFixed(1)}%`} />
        <Secundaria label={copy.tacos} descricao={infoKpi.tacos} observacao={infoKpi.tacosObservacao} valor={resumo.tacos} formatar={(n) => `${n.toFixed(1)}%`} />
        <Secundaria label={copy.cvr} descricao={infoKpi.cvr} observacao={infoKpi.cvrObservacao} valor={resumo.cvrMedio} formatar={(n) => `${n.toFixed(1)}%`} />
        <Secundaria label={copy.ctr} descricao={infoKpi.ctr} observacao={infoKpi.ctrObservacao} valor={resumo.ctrMedio} formatar={(n) => `${n.toFixed(2)}%`} />
        <Secundaria label={copy.cpc} descricao={infoKpi.cpc} observacao={infoKpi.cpcObservacao} valor={resumo.cpcMedio} formatar={(n) => moeda.format(n)} />
        <Secundaria label={copy.impressoes} descricao={infoKpi.impressoes} valor={resumo.impressoes} formatar={(n) => Math.round(n).toLocaleString("pt-BR")} />
        <Secundaria label={copy.cliques} descricao={infoKpi.cliques} valor={resumo.cliques} formatar={(n) => Math.round(n).toLocaleString("pt-BR")} />
        <Secundaria label={copy.vendas} descricao={infoKpi.vendas} observacao={infoKpi.vendasObservacao} valor={resumo.vendas} formatar={(n) => Math.round(n).toLocaleString("pt-BR")} />
      </motion.div>
    </div>
  );
}

function Secundaria({ label, descricao, observacao, valor, formatar }: { label: string; descricao: string; observacao?: string; valor: number | null; formatar: (n: number) => string }) {
  return (
    <motion.div variants={fadeUp} className="min-w-0">
      <p className="text-[15px] font-bold tabular-nums text-foreground">{valor === null ? "Sem dado" : formatar(valor)}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        <RotuloComInfo descricao={descricao} observacao={observacao}>{label}</RotuloComInfo>
      </p>
    </motion.div>
  );
}

/** Variação simples, só decorativa quando existir comparação — hoje sempre
 *  null (não há histórico multi-dia ainda), mas o componente já existe
 *  pronto pro dia em que a Fase "Tendência" ligar isso a período anterior. */
export function Variacao({ percentual }: { percentual: number | null }) {
  const reduzir = useReducedMotion();
  if (percentual === null) return null;
  const positiva = percentual >= 0;
  return (
    <motion.span
      initial={reduzir ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={reduzir ? { duration: 0 } : springs.settleFast}
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums"
      style={{ background: positiva ? tint("var(--success)", 12) : tint("var(--destructive)", 12), color: positiva ? "var(--success)" : "var(--destructive)" }}
    >
      {positiva ? <TrendingUp size={12} strokeWidth={2.5} /> : <TrendingDown size={12} strokeWidth={2.5} />}
      {positiva ? "+" : ""}{percentual}%
    </motion.span>
  );
}
