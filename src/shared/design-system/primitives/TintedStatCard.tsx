"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { springs } from "../motion-variants";

/* ── Card de métrica com cor consistente ────────────────────────────
   Antes existiam duas versões: uma sempre branca (resumo de Vendas) e outra
   que tingia o fundo só em 2 de 3 casos (saúde do Estoque, com "Parados"
   caindo numa exceção que zerava a cor). Aqui a regra é uma só: fundo
   sempre branco, ícone + label + valor sempre coloridos com a cor
   semântica — mesmo peso visual em todo card, sem fundo colorido pesando
   na leitura. Não é o `StatCard` genérico (esse já tem outro dono, o
   painel de consumo de IA) — este é específico pra grades de indicador
   com cor semântica. */

export interface TintedStatCardProps {
  label: ReactNode;
  valor: ReactNode;
  icon: LucideIcon;
  /** Cor semântica do card (CSS var ou cor crua) — tinge fundo, ícone, label e valor. */
  cor: string;
  sub?: ReactNode;
  /** Quando presente, o card vira um botão (usado como filtro clicável). */
  onClick?: () => void;
  ativo?: boolean;
}

export function TintedStatCard({ label, valor, icon: Icon, cor, sub, onClick, ativo }: TintedStatCardProps) {
  const reduzir = useReducedMotion();
  const Tag = onClick ? motion.button : motion.div;

  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-pressed={onClick ? ativo : undefined}
      whileHover={reduzir || !onClick ? undefined : { y: -4, scale: 1.02 }}
      whileTap={reduzir || !onClick ? undefined : { scale: 0.94 }}
      transition={springs.momentum}
      className="relative overflow-hidden rounded-[1.15rem] border-2 p-4 text-left shadow-[0_2px_14px_rgba(14,15,19,.06)] transition-[box-shadow,border-color] hover:shadow-[0_10px_28px_rgba(14,15,19,.12)]"
      style={{
        borderColor: ativo ? cor : "transparent",
        background: "var(--card)",
      }}
    >
      {/* Pulso de seleção: só quando é clicável e acaba de ativar — anel na
       *  cor do card que nasce colado e se expande sumindo (AnimatePresence
       *  monta uma vez por ativação, não é loop). */}
      {onClick && (
        <AnimatePresence>
          {ativo && !reduzir && (
            <motion.span
              key="halo"
              initial={{ opacity: 0.5, scale: 0.85 }}
              animate={{ opacity: 0, scale: 1.5 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="pointer-events-none absolute inset-0 rounded-[1.15rem]"
              style={{ border: `2px solid ${cor}` }}
            />
          )}
        </AnimatePresence>
      )}
      <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: cor }}>
        <Icon size={15} strokeWidth={1.75} />
        {label}
      </div>
      <p className="mt-2 text-xl font-black tabular-nums" style={{ color: cor }}>{valor}</p>
      {sub && <p className="mt-1.5 text-[11px] text-muted-foreground">{sub}</p>}
    </Tag>
  );
}
