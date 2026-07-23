"use client";

import channelsConfig from "@/config/channels.json";

type Channel =
  | "mercadolivre"
  | "shopee"
  | "tiktok"
  | "tiktokshop"
  | "olist"
  | "whatsapp"
  | "instagram"
  | string;

type Size = "xs" | "sm" | "md" | "lg";
type Variant = "logo" | "badge" | "pill";

interface ChannelConfig {
  label: string;
  logo: string | null;
  fallback: string;
  accent: string;
  logoDark: boolean;
  iconAspect: number;
}

const CHANNELS = channelsConfig.items as Record<string, ChannelConfig>;

const LOGO_HEIGHT: Record<Size, number> = {
  xs: 14,
  sm: 20,
  md: 28,
  lg: 36,
};

const PILL_H: Record<Size, string> = {
  xs: "h-5 px-1.5",
  sm: "h-6 px-2",
  md: "h-7 px-2.5",
  lg: "h-9 px-3",
};

function normalizeKey(canal: string): string {
  const lower = canal.toLowerCase();
  return channelsConfig.aliases[lower as keyof typeof channelsConfig.aliases] ?? lower;
}

interface Props {
  canal: Channel;
  size?: Size;
  variant?: Variant;
  className?: string;
}

/**
 * Renders a marketplace / channel identity:
 * - variant="logo"  → icon only, no container, no border
 * - variant="badge" → white rounded container with the icon
 * - variant="pill"  → white rounded-full container + text label
 */
export function ChannelLogo({ canal, size = "sm", variant = "badge", className = "" }: Props) {
  const key    = normalizeKey(canal);
  const cfg = CHANNELS[key] ?? {
    label: canal,
    logo: null,
    fallback: canal.slice(0, 2).toUpperCase(),
    accent: channelsConfig.fallback.accent,
    logoDark: false,
    iconAspect: channelsConfig.fallback.iconAspect,
  };
  const h      = LOGO_HEIGHT[size];
  const iconW  = Math.round(h * cfg.iconAspect);

  const logoNode = cfg.logo ? (
    // Clip to icon-only by constraining width to iconW and hiding overflow
    <span style={{ display: "inline-flex", height: h, width: iconW, overflow: "hidden", flexShrink: 0 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={cfg.logo}
        alt={cfg.label}
        style={{ height: h, width: "auto", flexShrink: 0, display: "block" }}
        className={cfg.logoDark ? "dark:invert" : ""}
      />
    </span>
  ) : (
    <span
      className="font-bold text-white leading-none inline-flex items-center justify-center"
      style={{
        fontSize: h * 0.65,
        backgroundColor: cfg.accent,
        borderRadius: 4,
        padding: "1px 4px",
        height: h,
      }}
    >
      {cfg.fallback}
    </span>
  );

  if (variant === "logo") return <>{logoNode}</>;

  if (variant === "pill") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full bg-white border border-black/8 ${PILL_H[size]} ${className}`}
        style={{ boxShadow: "0 1px 3px rgba(0,0,0,.06)" }}
      >
        {logoNode}
        <span className="text-[11px] font-semibold text-gray-700 whitespace-nowrap">{cfg.label}</span>
      </span>
    );
  }

  // badge (default)
  return (
    <span
      className={`inline-flex items-center justify-center rounded-md bg-white border border-black/8 ${PILL_H[size]} ${className}`}
      style={{ boxShadow: "0 1px 3px rgba(0,0,0,.06)" }}
    >
      {logoNode}
    </span>
  );
}
