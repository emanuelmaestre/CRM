"use client";

import { motion } from "framer-motion";
import { springs } from "../motion-variants";

/* ── Atalho de período ─────────────────────────────────────────────
   Chegar em "hoje" custava abrir o calendário e clicar duas vezes (De: e
   Até:) — ou abrir o painel e usar o link "Hoje" de dentro dele, que só
   move uma das duas pontas por vez. Este botão fica ao lado dos dois
   ícones de calendário e resolve as duas pontas de uma vez.

   O visual copia o próprio botão de calendário (mesma altura de 44px,
   mesmo tratamento de borda/fundo quando "selecionado", mesma cor de
   hover) para ler como parte do mesmo grupo de controles, não como um
   botão extra solto ao lado. */
export function BotaoHoje({
  ativo,
  disabled,
  atraso = 0.08,
  onClick,
}: {
  /** true quando o período já é hoje→hoje — dá o mesmo feedback visual do
   *  dia selecionado no calendário, sem precisar abrir nada para saber. */
  ativo: boolean;
  disabled?: boolean;
  atraso?: number;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: -4, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...springs.settleFast, delay: atraso }}
      whileHover={disabled ? undefined : { scale: 1.02 }}
      whileTap={disabled ? undefined : { scale: 0.95 }}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={ativo}
      className={`inline-flex h-11 shrink-0 items-center justify-center rounded-[0.75rem] border px-3.5 text-xs font-bold transition-all duration-200 disabled:opacity-50 ${
        ativo
          ? "border-[color-mix(in_srgb,var(--selecionado)_45%,var(--border))] bg-[color-mix(in_srgb,#9B30D9_8%,var(--card))] text-selecionado"
          : "border-border bg-muted text-muted-foreground hover:border-[rgba(155,48,217,.4)] hover:bg-card hover:text-selecionado"
      }`}
    >
      Hoje
    </motion.button>
  );
}
