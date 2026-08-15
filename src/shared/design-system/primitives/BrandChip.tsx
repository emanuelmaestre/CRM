"use client";

import { BrandLogo } from "./BrandLogo";
import type { BrandSlug } from "@/shared/config/brands";

interface BrandChipProps {
  brand: BrandSlug;
  className?: string;
}

export function BrandChip({ brand, className }: BrandChipProps) {
  return <BrandLogo brand={brand} height={20} className={className} />;
}
