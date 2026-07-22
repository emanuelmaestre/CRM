"use client";

// Crops uncao.svg (297×72) to show only the KARZI or WUWU side.
// Divider line is at x=212.94 in original SVG coords.
const DIVIDER = 212.94;
const SVG_H   = 72;
const SVG_W   = 297;

interface Props {
  brand: "karzi" | "wuwu";
  height?: number;
  className?: string;
}

export function BrandLogo({ brand, height = 22, className = "" }: Props) {
  const scale      = height / SVG_H;
  const fullW      = SVG_W * scale;
  const divX       = DIVIDER * scale;

  const isKarzi    = brand === "karzi";
  const clipW      = isKarzi ? divX : fullW - divX;
  const marginLeft = isKarzi ? 0 : -divX;

  return (
    <div
      className={className}
      style={{ height, width: clipW, overflow: "hidden", display: "flex", alignItems: "center", flexShrink: 0 }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logos/uncao.svg"
        alt={brand === "karzi" ? "KARZI" : "WUWU"}
        style={{ height, width: "auto", flexShrink: 0, marginLeft }}
      />
    </div>
  );
}
