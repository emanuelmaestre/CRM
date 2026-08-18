"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
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
  label: string;
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
      whileHover={reduzir || !onClick ? undefined : { y: -2 }}
      whileTap={reduzir || !onClick ? undefined : { scale: 0.98 }}
      transition={springs.settleFast}
      className="rounded-[1.15rem] border-2 p-4 text-left shadow-[0_2px_14px_rgba(14,15,19,.06)] transition-[box-shadow,border-color] hover:shadow-[0_7px_22px_rgba(14,15,19,.09)]"
      style={{
        borderColor: ativo ? cor : "transparent",
        background: "var(--card)",
      }}
    >
      <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: cor }}>
        <Icon size={15} strokeWidth={1.75} />
        {label}
      </div>
      <p className="mt-2 text-xl font-black tabular-nums" style={{ color: cor }}>{valor}</p>
      {sub && <p className="mt-1.5 text-[11px] text-muted-foreground">{sub}</p>}
    </Tag>
  );
}
