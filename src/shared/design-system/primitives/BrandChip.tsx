"use client";

import { BrandLogo } from "./BrandLogo";
import type { BrandId } from "../tokens";

interface BrandChipProps {
  brand: BrandId;
  className?: string;
}

export function BrandChip({ brand, className }: BrandChipProps) {
  return <BrandLogo brand={brand} height={20} className={className} />;
}
