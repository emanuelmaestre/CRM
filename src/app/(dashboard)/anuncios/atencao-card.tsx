"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { Alerta, GrupoAlertas } from "@/modules/anuncios/application/alertas";
import { springs } from "@/shared/design-system/motion-variants";

export const COR_PRIORIDADE: Record<Alerta["prioridade"], string> = {
  critico: "var(--destructive)",
  importante: "var(--escala-2)",
  oportunidade: "var(--success)",
  informativo: "var(--info)",
};

export const EMOJI_PRIORIDADE: Record<Alerta["prioridade"], string> = {
  critico: "🔴",
  importante: "🟡",
  oportunidade: "🟢",
  informativo: "🔵",
};

export function LinhaAlerta({ alerta, indice }: { alerta: Alerta; indice: number }) {
  const cor = COR_PRIORIDADE[alerta.prioridade];
  const reduzir = useReducedMotion();
  return (
    <motion.li
      initial={reduzir ? false : { opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={reduzir ? { duration: 0 } : { ...springs.settleFast, delay: indice * 0.05 }}
      className="flex items-start gap-2.5 rounded-[0.9rem] border border-border p-3"
      style={{ borderLeft: `3px solid ${cor}` }}
    >
      <span className="mt-0.5 text-sm leading-none">{EMOJI_PRIORIDADE[alerta.prioridade]}</span>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-foreground">{alerta.campanhaNome}</p>
        <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{alerta.descricao}</p>
      </div>
    </motion.li>
  );
}

export function LinhaGrupo({ grupo, indice }: { grupo: GrupoAlertas; indice: number }) {
  const cor = COR_PRIORIDADE[grupo.prioridade];
  const reduzir = useReducedMotion();
  return (
    <motion.li
      initial={reduzir ? false : { opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={reduzir ? { duration: 0 } : { ...springs.settleFast, delay: indice * 0.05 }}
      className="flex items-start gap-2.5 rounded-[0.9rem] border border-border p-3"
      style={{ borderLeft: `3px solid ${cor}` }}
    >
      <span className="mt-0.5 text-sm leading-none">{EMOJI_PRIORIDADE[grupo.prioridade]}</span>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-foreground">
          {grupo.alertas.length} campanhas · {grupo.tituloBase}
        </p>
        <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
          {grupo.alertas.map((a) => a.campanhaNome).join(", ")}
        </p>
      </div>
    </motion.li>
  );
}
