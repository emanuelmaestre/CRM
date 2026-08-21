"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { springs } from "../motion-variants";

/** Pulso em volta do botão quando "hoje" está selecionado — na cor de
 *  identidade de quem chamou o botão (o acento do card aberto, no
 *  Métricas; a cor da marca ativa, em Anúncios), não num índigo fixo:
 *  aquele já satura as pílulas de marca/canal e o dia marcado no
 *  calendário, e usá-lo aqui também confundia "período aplicado" com
 *  "filtro marcado". */
function HaloSelecao({ accent }: { accent: string }) {
  const reduzMovimento = useReducedMotion();
  return (
    <AnimatePresence>
      <motion.span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[0.75rem]"
        style={{ boxShadow: `0 0 0 2px ${accent}` }}
        initial={{ opacity: 0, scale: 1 }}
        animate={reduzMovimento ? { opacity: 0.55 } : { opacity: [0.55, 0.1, 0.55], scale: [1, 1.06, 1] }}
        transition={reduzMovimento ? undefined : { duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
      />
    </AnimatePresence>
  );
}

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
  className,
  accent = "var(--acento-1)",
}: {
  /** true quando o período já é hoje→hoje — dá o mesmo feedback visual do
   *  dia selecionado no calendário, sem precisar abrir nada para saber. */
  ativo: boolean;
  disabled?: boolean;
  atraso?: number;
  onClick: () => void;
  /** No mobile o calendário já abre com o mesmo atalho "Hoje" lá dentro
   *  (ver CalendarioPopoverRange) — o botão avulso some só ali para não
   *  duplicar a ação, e volta no desktop onde sobra espaço. */
  className?: string;
  /** Cor de identidade de quem chamou o botão — o mesmo acento do ícone do
   *  card aberto, no Métricas, ou a cor da marca ativa, em Anúncios. Sem
   *  isso, cai no teal padrão do design system. */
  accent?: string;
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
      style={ativo && !disabled
        ? { borderColor: accent, color: accent, background: `color-mix(in srgb, ${accent} 12%, var(--card))` }
        : undefined}
      className={`relative h-11 shrink-0 items-center justify-center rounded-[0.75rem] px-3.5 text-xs transition-all duration-200 disabled:opacity-50 ${
        ativo
          ? "border-2 font-extrabold shadow-[0_2px_6px_rgba(14,15,19,.14)]"
          : "border border-border bg-muted font-bold text-muted-foreground hover:bg-card hover:text-foreground"
      } ${className ?? "inline-flex"}`}
    >
      {ativo && !disabled && <HaloSelecao accent={accent} />}
      Hoje
    </motion.button>
  );
}
