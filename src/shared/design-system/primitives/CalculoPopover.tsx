"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Info } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { springs } from "../motion-variants";

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
  periodoLabel?: string;
  /** Frase curta, ex.: "pedidos cancelados ou devolvidos ÷ total de pedidos". */
  formula: string;
  itens: CalculoItem[];
  resultado: string;
  /** Ressalva opcional, ex.: por que o valor é "—" ou o que fica de fora da conta. */
  nota?: string;
}

export function CalculoPopover({ titulo, periodoLabel, formula, itens, resultado, nota }: CalculoPopoverProps) {
  const reduzir = useReducedMotion();
  const barra = itens.find((item) => item.fracao !== undefined);

  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label={`Como calculamos: ${titulo}`}
          className="press-feedback inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground/40 opacity-70 transition-all hover:text-foreground hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Info size={11} strokeWidth={2.25} />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className="z-[100] w-72 origin-[var(--radix-popover-content-transform-origin)] rounded-[1rem] border border-border bg-card p-4 shadow-[0_16px_40px_rgba(14,15,19,.24)] outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-[13px] font-bold text-foreground">{titulo}</p>
            <span className="shrink-0 text-[13px] font-bold tabular-nums text-foreground">{resultado}</span>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{formula}</p>

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

          <dl className="mt-3 space-y-1.5">
            {itens.map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-3 text-[12px]">
                <dt className="text-muted-foreground">{item.label}</dt>
                <dd className="font-semibold tabular-nums text-foreground">{item.valor}</dd>
              </div>
            ))}
          </dl>

          {(periodoLabel || nota) && (
            <p className="mt-3 border-t border-border pt-2.5 text-[10.5px] leading-relaxed text-muted-foreground/80">
              {periodoLabel && <>Período: {periodoLabel}. </>}
              {nota}
            </p>
          )}

          <PopoverPrimitive.Arrow className="fill-card" />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
