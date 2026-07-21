"use client";

import { cn } from "../cn";
import type { BrandId } from "../tokens";

interface BrandChipProps {
  brand: BrandId;
  className?: string;
}

const brandConfig = {
  karzi: {
    label: "KARZI",
    bg: "bg-[#E3131B]/10",
    text: "text-[#E3131B]",
    border: "border-[#E3131B]/20",
  },
  wuwu: {
    label: "WUWU",
    bg: "bg-[#9B30D9]/10",
    text: "text-[#9B30D9]",
    border: "border-[#9B30D9]/20",
  },
};

export function BrandChip({ brand, className }: BrandChipProps) {
  const config = brandConfig[brand];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold",
        config.bg,
        config.text,
        config.border,
        className
      )}
    >
      {config.label}
    </span>
  );
}
