import type { MetadataRoute } from "next";
import appConfig from "@/config/app.json";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: appConfig.fullName,
    // Próprio, e não o identityLabel: o sistema operacional corta o nome sob
    // o ícone do app instalado, então aqui cabe menos texto que na tela.
    short_name: appConfig.shortName,
    description: appConfig.description,
    start_url: "/metricas",
    display: "standalone",
    background_color: appConfig.viewport.themeColor,
    theme_color: appConfig.viewport.themeColor,
    orientation: "portrait-primary",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
    categories: ["business", "productivity"],
    lang: "pt-BR",
    dir: "ltr",
    shortcuts: [
      { name: "Clientes", short_name: "Clientes", url: "/clientes", description: "Abrir lista de clientes" },
      { name: "Avaliações", short_name: "Avaliações", url: "/avaliacoes", description: "Abrir avaliações do Mercado Livre" },
      { name: "Vendas", short_name: "Vendas", url: "/vendas", description: "Abrir pedidos" },
    ],
  };
}
