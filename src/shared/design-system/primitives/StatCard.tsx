"use client";

import { cn } from "../cn";

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  trend?: { value: number; label: string };
  className?: string;
}

export function StatCard({ label, value, sub, trend, className }: StatCardProps) {
  return (
    <div className={cn(
      "rounded-[1.25rem] border border-border bg-card p-5 shadow-[0_4px_20px_rgba(14,15,19,.06)]",
      className
    )}>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="mt-2 text-[22px] font-bold tabular-nums text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      {trend && (
        <p className={cn(
          "text-xs font-medium mt-2",
          trend.value >= 0 ? "text-[#1F8A4C]" : "text-[#C21820]"
        )}>
          {trend.value >= 0 ? "▲" : "▼"} {Math.abs(trend.value)}% {trend.label}
        </p>
      )}
    </div>
  );
}
