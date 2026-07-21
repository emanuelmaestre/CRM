"use client";

import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";
import { cn } from "../cn";

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  trend?: { value: number; label: string };
  icon?: LucideIcon;
  className?: string;
}

export function StatCard({ label, value, sub, trend, icon: Icon, className }: StatCardProps) {
  return (
    <motion.div
      whileHover={{ y: -2, boxShadow: "0 8px 30px rgba(14,15,19,.11)" }}
      transition={{ duration: 0.18 }}
      className={cn(
        "rounded-[1.25rem] bg-card p-5 shadow-[0_2px_16px_rgba(14,15,19,.07)]",
        className
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
        {Icon && (
          <motion.div
            whileHover={{ rotate: 12, scale: 1.15 }}
            className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center text-muted-foreground"
          >
            <Icon size={15} strokeWidth={1.75} />
          </motion.div>
        )}
      </div>
      <motion.p
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-[26px] font-bold tabular-nums leading-none text-foreground"
      >
        {value}
      </motion.p>
      {sub && <p className="text-xs text-muted-foreground mt-1.5">{sub}</p>}
      {trend && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className={cn(
            "text-xs font-semibold mt-3 tabular-nums",
            trend.value >= 0 ? "text-[#1F8A4C]" : "text-[#C21820]"
          )}
        >
          {trend.value >= 0 ? "▲" : "▼"} {Math.abs(trend.value)}% {trend.label}
        </motion.p>
      )}
    </motion.div>
  );
}
