"use client";

import { motion } from "framer-motion";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { VisaoGeralResumo } from "@/modules/anuncios/application/visao-geral.service";
import { springs, fadeUp } from "@/shared/design-system/motion-variants";
import anunciosConfig from "@/config/anuncios.json";
import { useContagem } from "./anuncios-primitives";
import { COR_ROAS, SetaRoas, situacaoRoas } from "./roas";

const copy = anunciosConfig.kpis;
const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/* ── Hierarquia de KPIs ────────────────────────────────────────
   Primeira linha: os 4 números que respondem "o que está acontecendo"
   em 10 segundos (brief, seção "Princípio central"). Segunda linha:
   métricas secundárias, menores, mesma leitura mas sem competir com as
   primárias por atenção. Nada de 15 cards iguais. */

function NumeroGrande({ label, valor, formatar, cor, sufixo, prefixo, destaque = false }: {
  label: string;
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
      <p className="mt-1.5 truncate text-xs font-medium text-muted-foreground">{label}</p>
      {sufixo}
    </motion.div>
  );
}

export function KpisPrincipais({ resumo }: { resumo: VisaoGeralResumo }) {
  const lucroPositivo = resumo.lucroTotal >= 0;

  return (
    <div className="card-surface p-5">
      {/* Linha 1 — os quatro números que importam primeiro */}
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
        <NumeroGrande label={copy.investimento} valor={resumo.investimentoTotal} formatar={(n) => moeda.format(n)} destaque />
        <NumeroGrande label={copy.receita} valor={resumo.receitaTotal} formatar={(n) => moeda.format(n)} destaque />
        {/* Único KPI com seta: os outros três são dinheiro, e o sinal de menos
            já diferencia sem depender de cor. ROAS não tem sinal. */}
        <NumeroGrande
          label={copy.roas}
          valor={resumo.roasMedio}
          formatar={(n) => `${n.toFixed(2)}x`}
          destaque
          cor={COR_ROAS[situacaoRoas(resumo.roasMedio, null)]}
          prefixo={<SetaRoas situacao={situacaoRoas(resumo.roasMedio, null)} />}
        />
        <NumeroGrande
          label={copy.lucro}
          valor={resumo.lucroTotal}
          formatar={(n) => moeda.format(n)}
          destaque
          cor={lucroPositivo ? "var(--success)" : "var(--destructive)"}
          sufixo={resumo.lucroIncompleto && (
            <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
              estimativa parcial
            </span>
          )}
        />
      </div>

      {/* Linha 2 — secundárias, visualmente menores */}
      <motion.div
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04, delayChildren: 0.1 } } }}
        className="mt-6 grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-5"
      >
        <Secundaria label={copy.acos} valor={resumo.acosMedio} formatar={(n) => `${n.toFixed(1)}%`} />
        <Secundaria label={copy.tacos} valor={resumo.tacos} formatar={(n) => `${n.toFixed(1)}%`} />
        <Secundaria label={copy.cvr} valor={resumo.cvrMedio} formatar={(n) => `${n.toFixed(1)}%`} />
        <Secundaria label={copy.ctr} valor={resumo.ctrMedio} formatar={(n) => `${n.toFixed(2)}%`} />
        <Secundaria label={copy.cpc} valor={resumo.cpcMedio} formatar={(n) => moeda.format(n)} />
      </motion.div>
    </div>
  );
}

function Secundaria({ label, valor, formatar }: { label: string; valor: number | null; formatar: (n: number) => string }) {
  return (
    <motion.div variants={fadeUp} className="min-w-0">
      <p className="text-[15px] font-bold tabular-nums text-foreground">{valor === null ? "—" : formatar(valor)}</p>
      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{label}</p>
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
      style={{ background: positiva ? "rgba(31,138,76,.12)" : "rgba(194,24,32,.12)", color: positiva ? "var(--success)" : "var(--destructive)" }}
    >
      {positiva ? <TrendingUp size={12} strokeWidth={2.5} /> : <TrendingDown size={12} strokeWidth={2.5} />}
      {positiva ? "+" : ""}{percentual}%
    </motion.span>
  );
}

