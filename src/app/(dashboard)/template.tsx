"use client";

import { motion, useReducedMotion } from "framer-motion";
import { springs, transicao } from "@/shared/design-system/motion-variants";

/* ── Transição de página ──────────────────────────────────────────
   `template.tsx` (diferente de `layout.tsx`) recebe uma instância nova a
   cada navegação — é exatamente essa remontagem que permite a entrada
   animar de novo em toda troca de rota, sem precisar de `AnimatePresence`
   nem de uma `key` manual por caminho.

   Fica só no grupo `(dashboard)`, por baixo do `layout.tsx` que já não
   remonta (TopNav/BottomNav continuam parados, sem piscar) — o efeito é
   só no conteúdo de cada página. É por isso que o risco de "perder estado
   ao navegar" citado na auditoria não se aplica aqui: como este é o layout
   mais externo do grupo, cada página já seria uma árvore de componentes
   nova de qualquer forma (Clientes → Estoque é sempre remontagem, com ou
   sem este arquivo). O ganho é só visual: o corte seco vira uma entrada
   leve, coerente com o resto do design system. */
export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  const reduzir = useReducedMotion();

  return (
    <motion.div
      initial={reduzir ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={transicao(reduzir, springs.settleFast)}
    >
      {children}
    </motion.div>
  );
}
