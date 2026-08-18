"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { fadeUp, springs } from "@/shared/design-system/motion-variants";
import { cn } from "@/shared/design-system/cn";
import { tint } from "@/shared/design-system/color";
import { BrandLogo } from "@/shared/design-system/primitives/BrandLogo";
import { AnimatedInfoPopover, AnimatedInfoTrigger } from "@/shared/design-system/primitives/AnimatedInfoPopover";
import { isBrandSlug } from "@/shared/config/brands";

/* Mesmos primitivos visuais de Métricas (Card/CardHead/SectionLabel/
   useContagem) — repetidos aqui em vez de importados de outra rota, pelo
   mesmo motivo que já vale para dashboard/card-primitives.tsx e
   metricas/metricas-primitives.tsx no projeto: páginas irmãs, não uma
   dependendo da outra. O objetivo do brief ("parecer que sempre fez parte
   do produto") é sobre a linguagem visual ser idêntica, não sobre
   compartilhar o arquivo. */

/** Repete a marca ativa no cabeçalho de cards que ficam abaixo da primeira
 *  dobra — o seletor de marca no topo da página já sai de vista ao rolar,
 *  e sem isso não dá pra saber a que marca aquele card pertence sem rolar
 *  de volta. */
export function MarcaBadge({ brandSlug, brandLabel }: { brandSlug: string; brandLabel: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
      {isBrandSlug(brandSlug) ? <BrandLogo brand={brandSlug} height={12} /> : brandLabel}
    </span>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.section variants={fadeUp} className={cn("card-surface relative flex flex-col overflow-hidden", className)}>
      {children}
    </motion.section>
  );
}

export function CardHead({ title, subtitle, icon: Icon, accent, trailing }: {
  title: string;
  subtitle?: string;
  icon: React.ElementType;
  accent: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-3 px-4 pt-4 sm:px-5 sm:pt-5">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: tint(accent, 9), color: accent }}>
          <Icon size={17} strokeWidth={1.9} />
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-bold tracking-[-0.01em] text-foreground">{title}</h3>
          {subtitle && <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {trailing && <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">{trailing}</div>}
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <h2 className="text-label-md uppercase text-muted-foreground">{children}</h2>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

export function RotuloComInfo({ children, descricao, observacao }: {
  children: string;
  descricao: string;
  observacao?: string;
}) {
  const titulo = observacao ? `${children}: ${descricao} Observação: ${observacao}` : `${children}: ${descricao}`;

  return (
    <span className="inline-flex max-w-full items-center gap-1 align-middle">
      <span className="min-w-0 truncate">{children}</span>
      <AnimatedInfoPopover
        trigger={(
          <AnimatedInfoTrigger
            aria-label={`Explicar indicador ${children}`}
            title={titulo}
            iconSize={11}
            iconStrokeWidth={2.35}
            className="press-feedback inline-flex h-4 min-h-0 w-4 min-w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground/75 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        )}
        align="start"
        sideOffset={6}
        collisionPadding={12}
        className="z-[100] w-[min(21rem,calc(100vw-1.5rem))] rounded-xl border border-border bg-card p-3 text-left normal-case shadow-[0_12px_32px_rgba(14,15,19,.18)]"
      >
            <p className="text-[10px] font-bold uppercase tracking-[.08em] text-muted-foreground">Como ler este número</p>
            <p className="mt-0.5 text-[13px] font-bold text-foreground">{children}</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">{descricao}</p>
            {observacao && (
              <div className="mt-2 rounded-lg border border-border bg-muted/45 px-2.5 py-2">
                <p className="text-[10px] font-bold uppercase tracking-[.08em] text-muted-foreground">Observação</p>
                <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{observacao}</p>
              </div>
            )}
      </AnimatedInfoPopover>
    </span>
  );
}

export function useContagem(valor: number, duracao = 900): number {
  const [exibido, setExibido] = useState(valor);
  const anterior = useRef(valor);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduzMovimento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const de = anterior.current;
    if (reduzMovimento || de === valor) {
      anterior.current = valor;
      setExibido(valor);
      return;
    }
    const inicio = performance.now();
    let frame = requestAnimationFrame(function passo(agora: number) {
      const progresso = Math.min((agora - inicio) / duracao, 1);
      const suavizado = 1 - Math.pow(1 - progresso, 4);
      const atual = de + (valor - de) * suavizado;
      anterior.current = atual;
      setExibido(atual);
      if (progresso < 1) frame = requestAnimationFrame(passo);
    });
    return () => cancelAnimationFrame(frame);
  }, [valor, duracao]);

  return exibido;
}

export function BarraSimples({ valor, maximo, cor, atraso = 0, altura = 7 }: {
  valor: number; maximo: number; cor: string; atraso?: number; altura?: number;
}) {
  const largura = maximo > 0 ? Math.max(0, Math.min((valor / maximo) * 100, 100)) : 0;
  const reduzir = useReducedMotion();
  return (
    <div className="w-full overflow-hidden rounded-full" style={{ height: altura, background: "var(--chart-bar)" }}>
      <motion.div
        initial={reduzir ? false : { scaleX: 0 }}
        animate={{ scaleX: largura / 100 }}
        transition={reduzir ? { duration: 0 } : { ...springs.settle, delay: atraso }}
        className="h-full w-full rounded-l-full"
        style={{ background: cor, transformOrigin: "left" }}
      />
    </div>
  );
}
