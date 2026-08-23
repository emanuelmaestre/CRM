"use client";

import { motion } from "framer-motion";
import { ExternalLink } from "lucide-react";
import type { BrandSlug } from "@/shared/config/brands";

interface Props {
  slug: BrandSlug;
  conectado: boolean;
}

/**
 * Rodapé de autorização do card de canal da Shopee. Mesmo padrão do
 * MLChannelActions: a Shopee também usa OAuth por loja (não só credencial de
 * ambiente), então a ação de conectar vive aqui, junto do status da conta.
 */
export function ShopeeChannelActions({ slug, conectado }: Props) {
  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          {conectado ? "Conta autorizada" : "Não conectado"}
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
    </div>
  );
}
