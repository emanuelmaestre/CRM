"use client";

import channelsConfig from "@/config/channels.json";

type Channel =
  | "mercadolivre"
  | "shopee"
  | "tiktok"
  | "tiktokshop"
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
  iconScale: number;
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

/** Cor de identidade do canal (ex.: amarelo do Mercado Livre, laranja da Shopee),
 *  para pílulas/filtros tingirem de acordo com o canal em vez de uma cor fixa. */
export function channelAccent(canal: string): string {
  const cfg = CHANNELS[normalizeKey(canal)];
  return cfg?.accent ?? channelsConfig.fallback.accent;
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
    iconScale: channelsConfig.fallback.iconScale,
  };
  const h = LOGO_HEIGHT[size];
  // Os arquivos em /logos/*-icon.svg já são recortados no ícone, então basta dar
  // a altura: nada de recorte por overflow. O iconScale equaliza o peso visual
  // entre ícones de proporções diferentes (ver _doc em channels.json).
  const iconH = Math.round(h * cfg.iconScale);
  const iconW = Math.round(iconH * cfg.iconAspect);

  const logoNode = cfg.logo ? (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={cfg.logo}
      alt={cfg.label}
      width={iconW}
      height={iconH}
      style={{ height: iconH, width: iconW, flexShrink: 0, display: "block", objectFit: "contain" }}
      className={cfg.logoDark ? "dark:invert" : ""}
    />
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
