"use client";

import { motion } from "framer-motion";
import { ExternalLink } from "lucide-react";
import type { BrandSlug } from "@/shared/config/brands";

interface Props {
  slug: BrandSlug;
  conectado: boolean;
}

/**
 * Rodapé de autorização do card de canal do TikTok Shop, mesmo padrão do
 * ShopeeChannelActions: a autorização é OAuth por loja (não só credencial de
 * ambiente), então a ação de conectar vive aqui, junto do status da conta.
 */
export function TikTokChannelActions({ slug, conectado }: Props) {
  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          {conectado ? "conta autorizada" : "não conectado"}
        </p>

        <motion.a
          href={`/api/tiktok/connect?brand=${slug}`}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm"
          // Preto/branco: paleta de marca do TikTok no botão "Conectar".
          style={{
            background: conectado ? "var(--muted)" : "#000000",
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
