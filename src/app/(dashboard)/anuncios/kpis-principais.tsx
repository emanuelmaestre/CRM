"use client";

import { motion } from "framer-motion";
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

function descricaoKpi(resumo: VisaoGeralResumo) {
  const receitaTotal = resumo.receitaTotal + resumo.receitaOrganica;
  return {
    investimento: `Neste período, a marca investiu ${moeda.format(resumo.investimentoTotal)} em anúncios. Esse gasto entra nos cálculos de ROAS, ACOS, TACOS e CPC.`,
    receita: `Os anúncios geraram ${moeda.format(resumo.receitaTotal)} em receita atribuída pelo canal. Essa é a receita usada para medir retorno da mídia paga.`,
    roas: resumo.roasMedio === null
      ? "Sem investimento no período, o ROAS fica sem dado. Ele só existe quando há gasto para comparar com a receita atribuída."
      : `ROAS atual: ${roasTexto(resumo.roasMedio)}. Cada ${moeda.format(1)} investido trouxe ${moeda.format(resumo.roasMedio)} em receita atribuída; acima de 1,00x a mídia se pagou.`,
    acos: resumo.acosMedio === null
      ? "Sem receita atribuída no período, o ACOS fica sem dado. Ele mostra quanto da receita de anúncios foi consumido pelo investimento."
      : `ACOS atual: ${percentual(resumo.acosMedio)}. A cada ${moeda.format(100)} de receita atribuída, ${moeda.format(resumo.acosMedio)} corresponderam ao investimento em mídia; quanto menor, mais eficiente.`,
    tacos: resumo.tacos === null
      ? "Sem receita total no período, o TACOS fica sem dado. Ele compara investimento com vendas pagas e orgânicas juntas."
      : `TACOS atual: ${percentual(resumo.tacos)}. A mídia consumiu ${moeda.format(resumo.tacos)} a cada ${moeda.format(100)} de receita total (${moeda.format(receitaTotal)} somando ads e orgânico).`,
    cvr: resumo.cvrMedio === null
      ? "Sem cliques no período, a taxa de conversão fica sem dado. Ela mede quantos cliques viram venda."
      : `CVR atual: ${percentual(resumo.cvrMedio)}. Foram ${inteiro.format(resumo.vendas)} vendas atribuídas a partir de ${inteiro.format(resumo.cliques)} cliques.`,
    ctr: resumo.ctrMedio === null
      ? "Sem impressões no período, a taxa de clique fica sem dado. Ela mede se o anúncio exibido gerou interesse."
      : `CTR atual: ${percentual(resumo.ctrMedio)}. Foram ${inteiro.format(resumo.cliques)} cliques em ${inteiro.format(resumo.impressoes)} impressões.`,
    cpc: resumo.cpcMedio === null
      ? "Sem cliques no período, o CPC médio fica sem dado. Ele mostra quanto custou, em média, cada visita gerada por anúncio."
      : `CPC médio atual: ${moeda.format(resumo.cpcMedio)}. É o investimento de ${moeda.format(resumo.investimentoTotal)} dividido por ${inteiro.format(resumo.cliques)} cliques.`,
    impressoes: `Os anúncios apareceram ${inteiro.format(resumo.impressoes)} vezes no período. Use junto com CTR para saber se a vitrine está gerando interesse.`,
    cliques: `Os anúncios receberam ${inteiro.format(resumo.cliques)} cliques. Compare com impressões (CTR) e vendas (CVR) para entender onde o funil perde força.`,
    vendas: `Foram ${inteiro.format(resumo.vendas)} vendas atribuídas aos anúncios no período. Esse número alimenta a leitura de conversão e retorno da mídia.`,
  };
}

/* ── Hierarquia de KPIs ────────────────────────────────────────
   Primeira linha: os 4 números que respondem "o que está acontecendo"
   em 10 segundos (brief, seção "Princípio central"). Segunda linha:
   métricas secundárias, menores, mesma leitura mas sem competir com as
   primárias por atenção. Nada de 15 cards iguais. */

function NumeroGrande({ label, descricao, valor, formatar, cor, sufixo, prefixo, destaque = false }: {
  label: string;
  descricao: string;
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
      <p className={`${destaque ? "text-stat-lg" : "text-[22px] font-bold leading-none"} flex items-center gap-1 tabular-nums`} style={cor ? { color: cor } : undefined}>
        {valor !== null && prefixo}
        {valor === null ? "—" : formatar(animado)}
      </p>
      <p className="mt-1.5 text-xs font-medium text-muted-foreground">
        <RotuloComInfo descricao={descricao}>{label}</RotuloComInfo>
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
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <NumeroGrande label={copy.investimento} descricao={infoKpi.investimento} valor={resumo.investimentoTotal} formatar={(n) => moeda.format(n)} destaque />
        <NumeroGrande label={copy.receita} descricao={infoKpi.receita} valor={resumo.receitaTotal} formatar={(n) => moeda.format(n)} destaque />
        {/* Único KPI com seta: os outros três são dinheiro, e o sinal de menos
            já diferencia sem depender de cor. ROAS não tem sinal. */}
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

      {/* Linha 2 — secundárias, visualmente menores */}
      <motion.div
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04, delayChildren: 0.1 } } }}
        className="mt-6 grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4 lg:grid-cols-8"
      >
        <Secundaria label={copy.acos} descricao={infoKpi.acos} valor={resumo.acosMedio} formatar={(n) => `${n.toFixed(1)}%`} />
        <Secundaria label={copy.tacos} descricao={infoKpi.tacos} valor={resumo.tacos} formatar={(n) => `${n.toFixed(1)}%`} />
        <Secundaria label={copy.cvr} descricao={infoKpi.cvr} valor={resumo.cvrMedio} formatar={(n) => `${n.toFixed(1)}%`} />
        <Secundaria label={copy.ctr} descricao={infoKpi.ctr} valor={resumo.ctrMedio} formatar={(n) => `${n.toFixed(2)}%`} />
        <Secundaria label={copy.cpc} descricao={infoKpi.cpc} valor={resumo.cpcMedio} formatar={(n) => moeda.format(n)} />
        <Secundaria label={copy.impressoes} descricao={infoKpi.impressoes} valor={resumo.impressoes} formatar={(n) => Math.round(n).toLocaleString("pt-BR")} />
        <Secundaria label={copy.cliques} descricao={infoKpi.cliques} valor={resumo.cliques} formatar={(n) => Math.round(n).toLocaleString("pt-BR")} />
        <Secundaria label={copy.vendas} descricao={infoKpi.vendas} valor={resumo.vendas} formatar={(n) => Math.round(n).toLocaleString("pt-BR")} />
      </motion.div>
    </div>
  );
}

function Secundaria({ label, descricao, valor, formatar }: { label: string; descricao: string; valor: number | null; formatar: (n: number) => string }) {
  return (
    <motion.div variants={fadeUp} className="min-w-0">
      <p className="text-[15px] font-bold tabular-nums text-foreground">{valor === null ? "—" : formatar(valor)}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        <RotuloComInfo descricao={descricao}>{label}</RotuloComInfo>
      </p>
    </motion.div>
  );
}

/** Variação simples, só decorativa quando existir comparação — hoje sempre
 *  null (não há histórico multi-dia ainda), mas o componente já existe
 *  pronto pro dia em que a Fase "Tendência" ligar isso a período anterior. */
export function Variacao({ percentual }: { percentual: number | null }) {
  if (percentual === null) return null;
  const positiva = percentual >= 0;
  return (
    <motion.span
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={springs.settleFast}
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums"
      style={{ background: positiva ? tint("var(--success)", 12) : tint("var(--destructive)", 12), color: positiva ? "var(--success)" : "var(--destructive)" }}
    >
      {positiva ? <TrendingUp size={12} strokeWidth={2.5} /> : <TrendingDown size={12} strokeWidth={2.5} />}
      {positiva ? "+" : ""}{percentual}%
    </motion.span>
  );
}
