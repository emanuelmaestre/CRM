"use client";

import { motion, useReducedMotion } from "framer-motion";
import { springs } from "../motion-variants";
import { AnimatedInfoPopover, AnimatedInfoTrigger } from "./AnimatedInfoPopover";

/* ── "Como chegamos nesse número" ─────────────────────────────────
   Card mostra o resultado; ninguém mostrava a conta. O gatilho fica quase
   invisível por padrão (opacidade baixa, sem ocupar layout novo) e só chama
   atenção no hover/foco — descoberta por curiosidade, não decoração fixa. O
   conteúdo é sempre a mesma promessa: qual fração, com quais números crus,
   em qual período — nunca só a fórmula em abstrato. */

export interface CalculoItem {
  label: string;
  valor: string;
  /** Fração 0–1 que essa parte representa da barra — só o numerador leva. */
  fracao?: number;
}

interface CalculoPopoverProps {
  titulo: string;
  /** Explica em linguagem de negócio o que o indicador revela. */
  significado: string;
  periodoLabel?: string;
  /** Frase curta, ex.: "pedidos cancelados ou devolvidos ÷ total de pedidos". */
  formula: string;
  itens: CalculoItem[];
  resultado: string;
  /** Ressalva opcional, ex.: por que o valor é "—" ou o que fica de fora da conta. */
  nota?: string;
}

export function CalculoPopover({ titulo, significado, periodoLabel, formula, itens, resultado, nota }: CalculoPopoverProps) {
  const reduzir = useReducedMotion();
  const barra = itens.find((item) => item.fracao !== undefined);

  return (
    <AnimatedInfoPopover
      trigger={(
        <AnimatedInfoTrigger
          aria-label={`Entenda o indicador ${titulo}`}
          title={`Entenda o indicador: ${titulo}`}
          iconSize={15}
          className="press-feedback inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      )}
      align="start"
      sideOffset={8}
      collisionPadding={12}
      // O Radix já calcula quanto espaço sobra até a borda da tela nessa
      // direção e expõe em --radix-popover-content-available-height —
      // sem travar nisso, um conteúdo longo (5 pilares + período + nota)
      // simplesmente estourava por cima do cabeçalho do card quando
      // virava pra "top" por falta de espaço embaixo do gatilho.
      className="z-[100] flex max-h-[var(--radix-popover-content-available-height)] w-[min(23rem,calc(100vw-1.5rem))] flex-col overflow-y-auto overscroll-contain rounded-[1.1rem] border border-border bg-card p-5 shadow-[0_16px_40px_rgba(14,15,19,.24)]"
    >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[.08em] text-muted-foreground">Entenda o indicador</p>
              <p className="mt-0.5 text-[16px] font-bold text-foreground">{titulo}</p>
            </div>
            <span className="shrink-0 rounded-lg bg-muted px-2.5 py-1 text-[16px] font-bold tabular-nums text-foreground">{resultado}</span>
          </div>
          <section className="mt-4">
            <p className="text-[11px] font-bold uppercase tracking-[.07em] text-muted-foreground">O que significa</p>
            <p className="mt-1 text-[13px] leading-relaxed text-foreground/85">{significado}</p>
          </section>
          <section className="mt-3">
            <p className="text-[11px] font-bold uppercase tracking-[.07em] text-muted-foreground">Como é calculado</p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{formula}</p>
          </section>

          {barra && (
            <motion.div
              initial={reduzir ? false : { scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={springs.settle}
              style={{ transformOrigin: "left" }}
              className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
            >
              <motion.div
                initial={reduzir ? false : { width: 0 }}
                animate={{ width: `${Math.round((barra.fracao ?? 0) * 100)}%` }}
                transition={{ ...springs.settle, delay: reduzir ? 0 : 0.08 }}
                className="h-full rounded-full"
                style={{ background: "var(--gradient-signature)" }}
              />
            </motion.div>
          )}

          <p className="mt-4 text-[11px] font-bold uppercase tracking-[.07em] text-muted-foreground">Dados usados</p>
          <dl className="mt-2 space-y-2">
            {itens.map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-3 text-[14px]">
                <dt className="text-muted-foreground">{item.label}</dt>
                <dd className="font-semibold tabular-nums text-foreground">{item.valor}</dd>
              </div>
            ))}
          </dl>

          {(periodoLabel || nota) && (
            <div className="mt-4 border-t border-border pt-3">
              {periodoLabel && (
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[.07em] text-muted-foreground">Período analisado</p>
                  <p className="mt-1 text-[12px] font-semibold text-foreground">{periodoLabel}</p>
                </div>
              )}
              {nota && (
                <div className={periodoLabel ? "mt-3" : ""}>
                  <p className="text-[11px] font-bold uppercase tracking-[.07em] text-muted-foreground">Importante</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground/90">{nota}</p>
                </div>
              )}
            </div>
          )}

    </AnimatedInfoPopover>
  );
}
