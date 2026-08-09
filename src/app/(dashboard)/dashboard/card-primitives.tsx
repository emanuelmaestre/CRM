"use client";

import type { CSSProperties } from "react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { fadeUp } from "@/shared/design-system/motion-variants";

/* ── Card base ─────────────────────────────────────────────────
   Camada tonal: borda de 1px, raio de 16px e sombra ambiente.
   O hover escurece a borda (ver .card-surface em globals.css). */
export function Card({ children, className = "", style, coachmark }: {
  children: React.ReactNode;
  className?: string;
  style?: CSSProperties;
  coachmark?: string;
}) {
  return (
    <motion.div
      variants={fadeUp}
      className={`card-surface overflow-hidden relative ${className}`}
      style={style}
      data-coachmark={coachmark}
    >
      {children}
    </motion.div>
  );
}

/* ── Cabeçalho de card ─────────────────────────────────────────
   Título em headline-md + ícone circular tonal à direita. */
export function CardHead({
  title,
  subtitle,
  icon: Icon,
  accent,
  action,
  actionHref,
  badge,
  trailing,
  divided = true,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ElementType;
  accent?: string;
  action?: string;
  actionHref?: string;
  badge?: { label: string; tone: string };
  trailing?: React.ReactNode;
  divided?: boolean;
}) {
  return (
    <div className={`flex items-start justify-between gap-4 px-6 py-5 ${divided ? "border-b border-border" : ""}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-headline-md text-foreground">{title}</h3>
          {badge && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
              style={{ background: badge.tone + "1A", color: badge.tone }}
            >
              {badge.label}
            </span>
          )}
        </div>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {action && actionHref && (
          <motion.a
            href={actionHref}
            whileHover={{ x: 2 }}
            className="flex items-center gap-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            {action} <ArrowRight size={13} />
          </motion.a>
        )}
        {trailing}
        {Icon && accent && (
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            style={{ background: accent + "18", color: accent }}
          >
            <Icon size={18} strokeWidth={1.9} />
          </div>
        )}
      </div>
    </div>
  );
}
