"use client";

import appConfig from "@/config/app.json";
import type { BrandSlug } from "@/shared/config/brands";
import { BrandLogo } from "./BrandLogo";

interface Props {
  height?: number;
  className?: string;
}

export function BrandLogoGroup({ height = 22, className = "" }: Props) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`} aria-label={appConfig.logo.alt}>
      {appConfig.brandOrder.map((brand) => (
        <BrandLogo key={brand} brand={brand as BrandSlug} height={height} />
      ))}
    </span>
  );
}
