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
}

const CHANNELS: Record<string, ChannelConfig> = {
  mercadolivre: {
    label: "Mercado Livre",
    logo: "/logos/mercadolivre.svg",
    fallback: "ML",
    accent: "#FFE600",
  },
  shopee: {
    label: "Shopee",
    logo: "/logos/shopee.svg",
    fallback: "SP",
    accent: "#EE4D2D",
  },
  tiktok: {
    label: "TikTok Shop",
    logo: "/logos/tiktok.svg",
    fallback: "TK",
    accent: "#111111",
  },
  tiktokshop: {
    label: "TikTok Shop",
    logo: "/logos/tiktok.svg",
    fallback: "TK",
    accent: "#111111",
  },
  olist: {
    label: "Olist",
    logo: null,
    fallback: "OL",
    accent: "#F05B22",
  },
  whatsapp: {
    label: "WhatsApp",
    logo: null,
    fallback: "WA",
    accent: "#25D366",
  },
  instagram: {
    label: "Instagram",
    logo: null,
    fallback: "IG",
    accent: "#E1306C",
  },
};

const LOGO_HEIGHT: Record<Size, number> = {
  xs: 12,
  sm: 14,
  md: 18,
  lg: 24,
};

const PILL_H: Record<Size, string> = {
  xs: "h-5 px-1.5",
  sm: "h-6 px-2",
  md: "h-7 px-2.5",
  lg: "h-9 px-3",
};

function normalizeKey(canal: string): string {
  const map: Record<string, string> = {
    "mercado livre":  "mercadolivre",
    "tiktok shop":    "tiktokshop",
    "tiktok":         "tiktok",
    "whatsapp (z-api)": "whatsapp",
    "instagram":      "instagram",
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
 * - variant="logo"  → raw <img> with no container (embed inside your own pill/cell)
 * - variant="badge" → white rounded container with the logo (default)
 * - variant="pill"  → white rounded-full container + text label
 */
export function ChannelLogo({ canal, size = "sm", variant = "badge", className = "" }: Props) {
  const key  = normalizeKey(canal);
  const cfg  = CHANNELS[key] ?? { label: canal, logo: null, fallback: canal.slice(0, 2).toUpperCase(), accent: "#888" };
  const logoH = LOGO_HEIGHT[size];

  const logoNode = cfg.logo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={cfg.logo}
      alt={cfg.label}
      style={{ height: logoH, width: "auto", maxWidth: logoH * 3.5, display: "block", objectFit: "contain" }}
    />
  ) : (
    <span
      className="font-bold text-white leading-none"
      style={{
        fontSize: logoH * 0.7,
        backgroundColor: cfg.accent,
        borderRadius: 4,
        padding: "1px 4px",
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
