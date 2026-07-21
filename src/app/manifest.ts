import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LEO CRM — Plast Leo",
    short_name: "LEO CRM",
    description: "Central de clientes, estoque e vendas KARZI e WUWU",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#0E0F13",
    theme_color: "#0E0F13",
    orientation: "portrait-primary",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
    categories: ["business", "productivity"],
    lang: "pt-BR",
    dir: "ltr",
    shortcuts: [
      { name: "Clientes", short_name: "Clientes", url: "/clientes", description: "Abrir lista de clientes" },
      { name: "Inbox", short_name: "Inbox", url: "/inbox", description: "Abrir inbox unificado" },
      { name: "Vendas", short_name: "Vendas", url: "/vendas", description: "Abrir funil de vendas" },
    ],
  };
}
