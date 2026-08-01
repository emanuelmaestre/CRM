import brandsConfig from "@/config/brands.json";
import type { BrandSlug } from "@/shared/config/brands";

export const tokens = {
  colors: {
    // Marca
    karzi: "#E3131B",
    karziAccent: "#FFC400",
    wuwu: "#9B30D9",
    armarinhosLima: "#6F6F6E",
    gradientSignature: "linear-gradient(135deg, #E3131B 0%, #9B30D9 50%, #6F6F6E 100%)",

    // Semânticas
    success: "#1F8A4C",
    warning: "#B57A00",
    error: "#C21820",
    info: "#2563EB",

    // Neutros claro (Vitrine)
    light: {
      bg: "#F7F7F8",
      surface: "#FFFFFF",
      surfaceElevated: "#FFFFFF",
      border: "#E6E7EA",
      textPrimary: "#15171C",
      textSecondary: "#5A5F6A",
    },

    // Neutros escuro (Cabine)
    dark: {
      bg: "#0E0F13",
      surface: "#16181E",
      surfaceElevated: "#1C1F27",
      border: "#262A33",
      textPrimary: "#F2F3F5",
      textSecondary: "#9AA0AC",
    },
  },

  typography: {
    fonts: {
      heading: "var(--font-sora)",
      body: "var(--font-inter)",
    },
    sizes: {
      hero: "28px",
      pageTitle: "24px",
      section: "15px",
      metric: "22px",
      body: "14px",
      caption: "12px",
    },
    weights: {
      section: 700,
      metric: 700,
      body: 400,
    },
  },

  radius: {
    card: "1.25rem",
    button: "0.75rem",
    chip: "9999px",
    iconBadge: "40px",
  },

  shadows: {
    e1: "0 4px 20px rgba(14,15,19,.06)",
    e2: "0 8px 30px rgba(14,15,19,.10)",
    e3: "0 16px 40px rgba(14,15,19,.16)",
  },

  icons: {
    size: 18,
    stroke: 1.75,
  },

  motion: {
    pageEntry: { duration: 240, easing: "cubic-bezier(0.4,0,0.2,1)" },
    cardHover: { duration: 160 },
    bubble: { duration: 180 },
    metric: { duration: 600 },
    chart: { duration: 500 },
    approval: { duration: 220 },
    alert: { duration: 300 },
    nav: { duration: 200 },
    skeleton: { duration: 1400 },
    onboarding: { duration: 800 },
  },
} as const;

export type BrandId = BrandSlug;

export function brandColor(brand: BrandId) {
  return brandsConfig[brand].color;
}
