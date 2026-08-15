"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { MessagesSquare, TrendingDown, TrendingUp } from "lucide-react";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { Skeleton } from "@/shared/design-system/primitives/Skeleton";
import { ChannelLogo, channelAccent } from "@/shared/design-system/primitives/ChannelLogo";
import { springs } from "@/shared/design-system/motion-variants";
import channelsConfig from "@/config/channels.json";
import metricasConfig from "@/config/metricas.json";
import type { AtendimentoPorCanal, AtendimentoResumo, FaixaAtendimento } from "@/modules/metricas/application/atendimento.service";
import { BarraComLimite, Card, CardHead, useContagem } from "./metricas-primitives";
import { tint } from "@/shared/design-system/color";

function canalLabel(tipo: string) {
  return (channelsConfig.items as Record<string, { label?: string }>)[tipo]?.label ?? tipo;
}

/* ── Linha por canal ───────────────────────────────────────────
   Só o Mercado Livre tem consequência de reputação por atraso em
   pergunta — os outros canais custam experiência, não score. A
   badge "afeta reputação" existe para ninguém precisar decorar essa
   regra de negócio ao olhar a lista. */
function LinhaCanal({ canal, indice }: { canal: AtendimentoPorCanal; indice: number }) {
  const cor = channelAccent(canal.canal);
  const risco = canal.canal === "mercadolivre" && (canal.taxaResposta ?? 100) < 90;

  return (
    <motion.li
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ ...springs.settleFast, delay: 0.1 + indice * 0.05 }}
      className="flex flex-col gap-1.5 rounded-[0.75rem] border border-border p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <ChannelLogo canal={canal.canal} size="xs" variant="logo" />
          <span className="truncate text-[12px] font-semibold text-foreground">{canalLabel(canal.canal)}</span>
          {canal.canal === "mercadolivre" && (
            <span
              className="shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-bold"
              style={{ background: tint(risco ? "var(--destructive)" : "var(--success)", 9), color: risco ? "var(--destructive)" : "var(--success)" }}
            >
              afeta reputação
            </span>
          )}
        </span>
        <span className="shrink-0 text-[12px] font-bold tabular-nums text-foreground">
          {canal.taxaResposta === null ? "—" : `${canal.taxaResposta}%`}
        </span>
      </div>
      <BarraComLimite valor={canal.taxaResposta ?? 0} maximo={100} cor={cor} altura={6} atraso={0.12 + indice * 0.05} />
      <p className="text-[11px] tabular-nums text-muted-foreground">
        {canal.perguntas} perguntas{canal.medianaLabel ? ` · mediana ${canal.medianaLabel}` : ""}
      </p>
    </motion.li>
  );
}

const copy = metricasConfig.atendimentoCard;
const ACENTO = "var(--acento-1)";

/* ── Barra empilhada ───────────────────────────────────────────
   Uma barra só, dividida pelas faixas de espera, em vez de cinco
   barras separadas. Empilhado, o "verde contra o resto" se lê num
   golpe de vista; separado, obrigaria a somar de cabeça para saber
   se a maior parte foi bem atendida. Cada pedaço cresce em `width`
   com stagger da esquerda para a direita — a ordem do crescimento é
   a própria ordem do funil. */
function BarraFunil({ faixas, total, focada, onFocar }: {
  faixas: FaixaAtendimento[];
  total: number;
  focada: string | null;
  onFocar: (chave: string | null) => void;
}) {
  const reduzir = useReducedMotion();

  return (
    <div
      className="flex h-4 w-full gap-[2px] overflow-hidden rounded-full"
      onPointerLeave={() => onFocar(null)}
      role="img"
      aria-label={`Funil de resposta: ${faixas.map((faixa) => `${faixa.label}, ${faixa.quantidade}`).join("; ")}`}
    >
      {faixas.filter((faixa) => faixa.quantidade > 0).map((faixa, indice) => {
        // A largura de cada fatia é fixada de uma vez (define o layout flex,
        // calculado uma única vez) e o crescimento em si roda em scaleX — só
        // a largura muda a cada frame numa animação width, e numa barra com
        // 4-5 fatias isso é 4-5 reflows recalculados juntos a cada tick.
        const participacao = total > 0 ? (faixa.quantidade / total) * 100 : 0;
        return (
          <motion.div
            key={faixa.chave}
            initial={reduzir ? false : { scaleX: 0 }}
            animate={{
              scaleX: 1,
              opacity: focada === null || focada === faixa.chave ? 1 : 0.35,
            }}
            transition={reduzir ? { duration: 0 } : { ...springs.settle, delay: indice * 0.07 }}
            onPointerEnter={() => onFocar(faixa.chave)}
            className="h-full min-w-[3px] rounded-full"
            style={{ background: faixa.cor, width: `${participacao}%`, transformOrigin: "left" }}
          />
        );
      })}
    </div>
  );
}

function Destaque({ valor, label, cor, sufixo, variacao }: {
  valor: number;
  label: string;
  cor?: string;
  sufixo?: string;
  variacao?: number | null;
}) {
  const animado = useContagem(valor);
  const positiva = (variacao ?? 0) >= 0;

  return (
    <div className="min-w-0">
      <p className="flex items-baseline gap-1.5">
        <span className="text-[22px] font-bold leading-none tabular-nums" style={{ color: cor ?? "var(--foreground)" }}>
          {Math.round(animado * 10) / 10}{sufixo}
        </span>
        {variacao !== null && variacao !== undefined && (
          <span
            className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
            style={{
              background: positiva ? tint("var(--success)", 12) : tint("var(--destructive)", 12),
              color: positiva ? "var(--success)" : "var(--destructive)",
            }}
          >
            {positiva ? <TrendingUp size={10} strokeWidth={2.5} /> : <TrendingDown size={10} strokeWidth={2.5} />}
            {positiva ? "+" : ""}{variacao} p.p.
          </span>
        )}
      </p>
      <p className="mt-1 truncate text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

export function AtendimentoCard({ dados, carregando }: {
  dados: AtendimentoResumo | null;
  carregando: boolean;
}) {
  const [focada, setFocada] = useState<string | null>(null);
  const vazio = !dados || dados.perguntas === 0;

  return (
    <Card>
      <CardHead
        title={copy.titulo}
        subtitle={copy.subtitulo}
        icon={MessagesSquare}
        accent={ACENTO}
      />

      {carregando && !dados ? (
        <div className="space-y-3 px-5 pb-5 pt-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : vazio ? (
        <EmptyState illustration="generic" title={copy.vazio} description={copy.vazioDescricao} />
      ) : (
        <motion.div
          animate={{ opacity: carregando ? 0.55 : 1 }}
          transition={springs.settleFast}
          className="px-4 pb-5 pt-4 sm:px-5"
        >
          <div className="flex flex-wrap gap-x-8 gap-y-4">
            <Destaque valor={dados.perguntas} label={copy.perguntasLabel} />
            <Destaque
              valor={dados.taxaResposta ?? 0}
              sufixo="%"
              label={copy.respondidasLabel}
              cor={(dados.taxaResposta ?? 0) >= 90 ? "var(--success)" : (dados.taxaResposta ?? 0) >= 70 ? "var(--warning)" : "var(--destructive)"}
              variacao={dados.variacaoTaxaResposta}
            />
            {dados.medianaLabel && (
              <div className="min-w-0">
                <p className="text-[22px] font-bold leading-none tabular-nums text-foreground">{dados.medianaLabel}</p>
                <p className="mt-1 truncate text-[11px] text-muted-foreground">{copy.medianaLabel}</p>
              </div>
            )}
          </div>

          <div className="mt-5">
            <BarraFunil faixas={dados.faixas} total={dados.perguntas} focada={focada} onFocar={setFocada} />
          </div>

          <ul className="mt-4 flex flex-col gap-2">
            {dados.faixas.map((faixa, indice) => (
              <motion.li
                key={faixa.chave}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ...springs.settleFast, delay: 0.12 + indice * 0.04 }}
                onPointerEnter={() => setFocada(faixa.chave)}
                onPointerLeave={() => setFocada(null)}
                className="flex items-center gap-2.5 rounded-[0.6rem] px-1.5 py-1 transition-colors hover:bg-muted"
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: faixa.cor }} />
                <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">{faixa.label}</span>
                <span className="shrink-0 text-[12px] font-semibold tabular-nums text-foreground">{faixa.quantidade}</span>
                <span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                  {faixa.participacao}%
                </span>
              </motion.li>
            ))}
          </ul>

          {dados.porCanal.length > 1 && (
            <div className="mt-5 border-t border-border pt-4">
              <p className="mb-2.5 text-label-md uppercase text-muted-foreground">{copy.porCanalTitulo}</p>
              <ul className="flex flex-col gap-2">
                {dados.porCanal.map((canal, indice) => (
                  <LinhaCanal key={canal.canal} canal={canal} indice={indice} />
                ))}
              </ul>
            </div>
          )}

          <AnimatePresence initial={false}>
            {dados.medianaLabel && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-4 border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground"
              >
                {copy.medianaNota}
              </motion.p>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </Card>
  );
}
