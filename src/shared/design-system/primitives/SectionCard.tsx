"use client";

import type { LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "../cn";
import { springs, transicao } from "../motion-variants";

interface SectionCardProps {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function SectionCard({ title, description, icon: Icon, actions, children, className }: SectionCardProps) {
  const reduzir = useReducedMotion();
  return (
    <motion.div
      initial={reduzir ? false : { opacity: 0, y: 4, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={transicao(reduzir, springs.settleFast)}
      className={cn(
        "rounded-[1.25rem] bg-card shadow-[0_2px_16px_rgba(14,15,19,.07)]",
        className
      )}
    >
      {(title || actions) && (
        <div className="flex flex-col items-stretch gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            {Icon && (
              <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                <Icon size={14} strokeWidth={1.75} />
              </div>
            )}
            <div className="min-w-0">
              {title && <h2 className="text-[15px] font-bold tracking-[-0.01em] text-foreground">{title}</h2>}
              {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
            </div>
          </div>
          {actions && <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
        </div>
      )}
      <div className="p-4 sm:p-6">{children}</div>
    </motion.div>
  );
}
