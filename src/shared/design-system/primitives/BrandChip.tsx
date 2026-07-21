"use client";

import { cn } from "../cn";
import type { BrandId } from "../tokens";
import brandsConfig from "@/config/brands.json";

interface BrandChipProps {
  brand: BrandId;
  className?: string;
}

export function BrandChip({ brand, className }: BrandChipProps) {
  const config = brandsConfig[brand];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold",
        config.chip.background,
        config.chip.text,
        config.chip.border,
        className
      )}
    >
      {config.label}
    </span>
  );
}
