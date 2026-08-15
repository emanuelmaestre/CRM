"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { motion } from "framer-motion";
import { fadeUp, springs } from "@/shared/design-system/motion-variants";
import { cn } from "@/shared/design-system/cn";
import { tint } from "@/shared/design-system/color";

/* ── Card base ─────────────────────────────────────────────────
   Camada tonal: borda de 1px, raio de 20px e sombra ambiente
   (ver .card-surface em globals.css). */
export function Card({ children, className, style }: {
  children: React.ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <motion.section
      variants={fadeUp}
      className={cn("card-surface relative flex flex-col overflow-hidden", className)}
      style={style}
    >
      {children}
    </motion.section>
  );
}

/* ── Cabeçalho de card ─────────────────────────────────────────
   Ícone tonal na cor do assunto + título e subtítulo. O acento
   identifica o card de relance sem precisar ler o título. */
export function CardHead({ title, subtitle, icon: Icon, accent, scope, trailing, className }: {
  title: string;
  subtitle?: string;
  icon: React.ElementType;
  accent: string;
  scope?: React.ReactNode;
  trailing?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-3 px-4 pt-4 sm:px-5 sm:pt-5", className)}>
      <div className="flex min-w-0 flex-1 items-center gap-3 sm:flex-initial">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ background: tint(accent, 9), color: accent }}
        >
          <Icon size={17} strokeWidth={1.9} />
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-bold tracking-[-0.01em] text-foreground">{title}</h3>
          {subtitle && <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {scope && <div className="order-3 flex w-full flex-wrap items-center justify-start gap-2 sm:order-none sm:w-auto sm:min-w-40 sm:flex-1 sm:justify-center">{scope}</div>}
      {trailing && <div className="ml-auto flex max-w-full shrink-0 flex-wrap items-center justify-end gap-2">{trailing}</div>}
    </div>
  );
}

/* ── Rótulo de seção ───────────────────────────────────────────
   Wayfinding: diz de que assunto é o bloco abaixo, para o painel
   ser lido em três atos em vez de uma parede de cards. */
export function SectionLabel({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <h2 className="text-label-md uppercase text-muted-foreground">{children}</h2>
      {count !== undefined && count > 0 && (
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">
          {count}
        </span>
      )}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/* ── Controle segmentado ───────────────────────────────────────
   A pastilha ativa é um único elemento que desliza entre as opções
   (layoutId + spring), em vez de sumir de um lugar e aparecer no
   outro — o olho segue o movimento e entende a relação. */
export function Segmented<T extends string>({ value, options, onChange, layoutId, disabled }: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  layoutId: string;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex gap-0.5 rounded-[0.75rem] bg-muted p-1" role="tablist">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className="press-feedback relative rounded-[0.5rem] px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
            style={{ color: active ? "var(--foreground)" : "var(--muted-foreground)" }}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                transition={springs.settleFast}
                className="absolute inset-0 rounded-[0.5rem] bg-card shadow-[0_1px_4px_rgba(14,15,19,.10)]"
              />
            )}
            <span className="relative z-10">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ── Contagem animada ──────────────────────────────────────────
   O número sobe até o valor em vez de aparecer pronto: dá a leitura
   de que foi calculado agora. Desacelera no fim (sem overshoot, que
   em dinheiro passaria valor errado por um instante). Respeita
   prefers-reduced-motion — aí o valor entra direto. */
export function useContagem(valor: number): number {
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
    const duracao = 650;
    let frame = requestAnimationFrame(function passo(agora: number) {
      const progresso = Math.min((agora - inicio) / duracao, 1);
      const suavizado = 1 - Math.pow(1 - progresso, 4);
      const atual = de + (valor - de) * suavizado;
      // Acompanha frame a frame: se a troca de granularidade interromper no meio,
      // a próxima contagem parte de onde o número está, sem saltar para trás.
      anterior.current = atual;
      setExibido(atual);
      if (progresso < 1) frame = requestAnimationFrame(passo);
    });

    return () => cancelAnimationFrame(frame);
  }, [valor]);

  return exibido;
}
