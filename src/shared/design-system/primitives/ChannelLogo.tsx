"use client";

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
  logoDark?: boolean;
  // aspect ratio of ICON-ONLY portion of the SVG (icon_width / icon_height)
  // used to clip the img to hide the text wordmark
  iconAspect: number;
}

const CHANNELS: Record<string, ChannelConfig> = {
  mercadolivre: {
    label: "Mercado Livre",
    logo: "/logos/mercadolivre.svg",
    fallback: "ML",
    accent: "#FFE600",
    // yellow circle occupies left ~197px of 219.8px-tall viewBox
    iconAspect: 197 / 219.8,
  },
  shopee: {
    label: "Shopee",
    logo: "/logos/shopee.svg",
    fallback: "SP",
    accent: "#EE4D2D",
    // shopping-bag icon occupies left ~270px of 319.7px-tall viewBox
    iconAspect: 270 / 319.7,
  },
  tiktok: {
    label: "TikTok Shop",
    logo: "/logos/tiktok.svg",
    fallback: "TK",
    accent: "#111111",
    logoDark: true,
    // note icon occupies left ~70px of 80.1px-tall viewBox
    iconAspect: 70 / 80.1,
  },
  tiktokshop: {
    label: "TikTok Shop",
    logo: "/logos/tiktok.svg",
    fallback: "TK",
    accent: "#111111",
    logoDark: true,
    iconAspect: 70 / 80.1,
  },
  olist: {
    label: "Olist",
    logo: null,
    fallback: "OL",
    accent: "#F05B22",
    iconAspect: 1,
  },
  whatsapp: {
    label: "WhatsApp",
    logo: "/logos/whatsapp.svg",
    fallback: "WA",
    accent: "#25D366",
    // WhatsApp SVG is icon-only (phone in green circle), full width
    iconAspect: 1172.92 / 1474.52,
  },
  instagram: {
    label: "Instagram",
    logo: null,
    fallback: "IG",
    accent: "#E1306C",
    iconAspect: 1,
  },
};

const LOGO_HEIGHT: Record<Size, number> = {
  xs: 12,
  sm: 16,
  md: 20,
  lg: 26,
};

const PILL_H: Record<Size, string> = {
  xs: "h-5 px-1.5",
  sm: "h-6 px-2",
  md: "h-7 px-2.5",
  lg: "h-9 px-3",
};

function normalizeKey(canal: string): string {
  const map: Record<string, string> = {
    "mercado livre":    "mercadolivre",
    "tiktok shop":      "tiktokshop",
    "tiktok":           "tiktok",
    "whatsapp (z-api)": "whatsapp",
    "instagram":        "instagram",
  };
  const lower = canal.toLowerCase();
  return map[lower] ?? lower;
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
  const cfg    = CHANNELS[key] ?? { label: canal, logo: null, fallback: canal.slice(0, 2).toUpperCase(), accent: "#888", iconAspect: 1 };
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
