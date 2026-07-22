"use client";

interface Props {
  brand: "karzi" | "wuwu";
  height?: number;
  className?: string;
}

export function BrandLogo({ brand, height = 22, className = "" }: Props) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={brand === "karzi" ? "/logos/karzi.svg" : "/logos/wuwu.svg"}
      alt={brand === "karzi" ? "KARZI" : "WUWU"}
      className={className}
      style={{ height, width: "auto", display: "block", flexShrink: 0 }}
    />
  );
}
