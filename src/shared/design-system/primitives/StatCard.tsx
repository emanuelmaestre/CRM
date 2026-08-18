"use client";

import { motion, useReducedMotion } from "framer-motion";
import { LucideIcon } from "lucide-react";
import { cn } from "../cn";
import { springs, transicao } from "../motion-variants";

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  trend?: { value: number; label: string };
  icon?: LucideIcon;
  className?: string;
}

export function StatCard({ label, value, sub, trend, icon: Icon, className }: StatCardProps) {
  const reduzir = useReducedMotion();
  return (
    <motion.div
      transition={springs.settleFast}
      className={cn(
        "rounded-[1.25rem] bg-card p-5 shadow-[0_2px_16px_rgba(14,15,19,.07)]",
        className
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
        {Icon && (
          <motion.div
            whileHover={{ scale: 1.02 }}
            transition={springs.settleFast}
            className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center text-muted-foreground"
          >
            <Icon size={15} strokeWidth={1.75} />
          </motion.div>
        )}
      </div>
      <motion.p
        initial={reduzir ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={transicao(reduzir, springs.settleFast)}
        className="text-[26px] font-bold tabular-nums leading-none tracking-[-0.02em] text-foreground"
      >
        {value}
      </motion.p>
      {sub && <p className="text-xs text-muted-foreground mt-1.5">{sub}</p>}
      {trend && (
        <motion.p
          initial={reduzir ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={reduzir ? { duration: 0 } : { ...springs.settleFast, delay: 0.3 }}
          className={cn(
            "text-xs font-semibold mt-3 tabular-nums",
            trend.value >= 0 ? "text-success" : "text-destructive"
          )}
        >
          {trend.value >= 0 ? "▲" : "▼"} {Math.abs(trend.value)}% {trend.label}
        </motion.p>
      )}
    </motion.div>
  );
}
