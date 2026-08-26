"use client";

import { motion } from "framer-motion";
import { ExternalLink } from "lucide-react";
import type { BrandSlug } from "@/shared/config/brands";
import type { ShopeeApp } from "@/shared/config/shopee-env";

interface Props {
  slug: BrandSlug;
  /** App "Elisa Lima CRM" (Product Management) — catálogo/estoque/avaliações. */
  conectado: boolean;
  /** Conta OAuth do app "Elisa Lima Pedidos" (Order Management) já autorizada
   *  pra esta marca — independente de `conectado`, que reflete só o app de
   *  catálogo (CRM). Ver canal_tokens.canal = "shopee_pedidos". */
  pedidosConectado?: boolean;
  /** Conta OAuth do app "Elisa Lima Anuncios" (Ads Service, Product Ads).
   *  Ver canal_tokens.canal = "shopee_anuncios". */
  anunciosConectado?: boolean;
}

interface LinhaApp {
  app: ShopeeApp;
  rotulo: string;
  conectado: boolean;
}

/**
 * Rodapé de autorização do card de canal da Shopee. Mesmo padrão do
 * MLChannelActions: a Shopee também usa OAuth por loja (não só credencial de
 * ambiente), então a ação de conectar vive aqui, junto do status da conta.
 *
 * Uma linha por app do Shopee Open Platform, porque são autorizações
 * INDEPENDENTES da mesma loja: "Elisa Lima CRM" (catálogo/estoque/avaliações),
 * "Elisa Lima Pedidos" (pedidos) e "Elisa Lima Anuncios" (Product Ads). Cada
 * uma tem partner_id próprio e grava seu token na sua própria linha de
 * canal_tokens — conectar ou reconectar uma NÃO derruba as outras, então nunca
 * é preciso refazer as três de uma vez. Ver AGENTS.md/memória
 * "shopee-proxy-webshare" e obterShopeeAppCredenciais().
 */
export function ShopeeChannelActions({ slug, conectado, pedidosConectado, anunciosConectado }: Props) {
  const linhas: LinhaApp[] = [
    { app: "catalogo", rotulo: "Catálogo", conectado },
    { app: "pedidos", rotulo: "Pedidos", conectado: Boolean(pedidosConectado) },
    { app: "anuncios", rotulo: "Anúncios", conectado: Boolean(anunciosConectado) },
  ];

  return (
    <div className="mt-3 border-t border-border pt-3 space-y-2">
      {linhas.map((linha) => (
        <div key={linha.app} className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            {linha.rotulo}: {linha.conectado ? "conta autorizada" : "não conectado"}
          </p>

          <motion.a
            // O `app` na query decide qual par partner_id/partner_key assina a
            // autorização e em qual linha de canal_tokens o token cai; catálogo
            // é o default do endpoint, mas vai explícito pra deixar as três
            // linhas simétricas.
            href={`/api/shopee/connect?brand=${slug}&app=${linha.app}`}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm"
            title={
              linha.conectado
                ? `Reconectar só o app de ${linha.rotulo.toLowerCase()} — os outros apps da Shopee continuam conectados`
                : `Conectar o app de ${linha.rotulo.toLowerCase()} da Shopee`
            }
            // #EE4D2D: laranja de marca da própria Shopee no botão "Conectar".
            style={{
              background: linha.conectado ? "var(--muted)" : "#EE4D2D",
              color: linha.conectado ? "var(--muted-foreground)" : "#ffffff",
            }}
          >
            {linha.conectado ? "Reconectar" : "Conectar"}
            <ExternalLink size={10} strokeWidth={2.5} />
          </motion.a>
        </div>
      ))}
    </div>
  );
}
