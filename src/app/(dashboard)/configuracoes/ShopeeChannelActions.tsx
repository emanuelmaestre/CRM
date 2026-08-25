"use client";

import { motion } from "framer-motion";
import { ExternalLink } from "lucide-react";
import type { BrandSlug } from "@/shared/config/brands";

interface Props {
  slug: BrandSlug;
  conectado: boolean;
  /** Conta OAuth do app "Elisa Lima Pedidos" (Order Management) já autorizada
   *  pra esta marca — independente de `conectado`, que reflete só o app de
   *  catálogo (CRM). Ver canal_tokens.canal = "shopee_pedidos". */
  pedidosConectado?: boolean;
}

/**
 * Rodapé de autorização do card de canal da Shopee. Mesmo padrão do
 * MLChannelActions: a Shopee também usa OAuth por loja (não só credencial de
 * ambiente), então a ação de conectar vive aqui, junto do status da conta.
 *
 * Dois botões porque são duas autorizações independentes na Shopee: o app
 * "Elisa Lima CRM" (catálogo/estoque/avaliações) e o app "Elisa Lima Pedidos"
 * (pedidos), cada um com seu próprio token — ver AGENTS.md/memória
 * "shopee-proxy-webshare" e obterShopeeAppCredenciais().
 */
export function ShopeeChannelActions({ slug, conectado, pedidosConectado }: Props) {
  return (
    <div className="mt-3 border-t border-border pt-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          Catálogo: {conectado ? "conta autorizada" : "não conectado"}
        </p>

        <motion.a
          href={`/api/shopee/connect?brand=${slug}`}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm"
          // #EE4D2D: laranja de marca da própria Shopee no botão "Conectar".
          style={{
            background: conectado ? "var(--muted)" : "#EE4D2D",
            color: conectado ? "var(--muted-foreground)" : "#ffffff",
          }}
        >
          {conectado ? "Reconectar" : "Conectar"}
          <ExternalLink size={10} strokeWidth={2.5} />
        </motion.a>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          Pedidos: {pedidosConectado ? "conta autorizada" : "não conectado"}
        </p>

        <motion.a
          href={`/api/shopee/connect?brand=${slug}&app=pedidos`}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm"
          style={{
            background: pedidosConectado ? "var(--muted)" : "#EE4D2D",
            color: pedidosConectado ? "var(--muted-foreground)" : "#ffffff",
          }}
        >
          {pedidosConectado ? "Reconectar" : "Conectar"}
          <ExternalLink size={10} strokeWidth={2.5} />
        </motion.a>
      </div>
    </div>
  );
}
