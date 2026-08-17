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
    <span className={`inline-flex items-center gap-2.5 ${className}`} aria-label={appConfig.logo.alt}>
      {appConfig.brandOrder.map((brand, indice) => (
        <span key={brand} className="inline-flex items-center gap-2.5">
          {/* Sem o traço, marcas de largura parecida (WUWU/ARMARINHOS LIMA)
              se liam como uma logo só grudada na outra. */}
          {indice > 0 && <span aria-hidden="true" className="h-4 w-px shrink-0 bg-border" />}
          <BrandLogo brand={brand as BrandSlug} height={height} />
        </span>
      ))}
    </span>
  );
}
