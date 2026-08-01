"use client";

import Image from "next/image";
import brandsConfig from "@/config/brands.json";
import type { BrandSlug } from "@/shared/config/brands";

interface Props {
  brand: BrandSlug;
  height?: number;
  className?: string;
}

export function BrandLogo({ brand, height = 22, className = "" }: Props) {
  const config = brandsConfig[brand];
  return (
    <Image
      src={config.logo}
      alt={config.label}
      width={config.logoSize.width}
      height={config.logoSize.height}
      loading="eager"
      unoptimized
      className={className}
      style={{ height, width: "auto", display: "block", flexShrink: 0 }}
    />
  );
}
