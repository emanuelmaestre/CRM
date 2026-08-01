import type { MetadataRoute } from "next";
import appConfig from "@/config/app.json";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: appConfig.fullName,
    short_name: appConfig.identityLabel,
    description: appConfig.description,
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#0E0F13",
    theme_color: "#0E0F13",
    orientation: "portrait-primary",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
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
