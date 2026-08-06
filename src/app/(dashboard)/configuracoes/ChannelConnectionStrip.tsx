"use client";

import { motion } from "framer-motion";
import { BrandLogo } from "@/shared/design-system/primitives/BrandLogo";
import { ChannelLogo } from "@/shared/design-system/primitives/ChannelLogo";
import { isBrandSlug } from "@/shared/config/brands";
import { StatusDot } from "./StatusDot";
import type { CanalConfiguracao } from "@/modules/canais/application/configuracao-canais.service";

interface Props {
  canal: string;
  items: CanalConfiguracao[];
}

/**
 * Mesma faixa-resumo do Mercado Livre, para canais ainda não integrados: mostra
 * a identidade do marketplace e o status por marca (sempre "Pendente" até a
 * integração existir), sem exigir uma ligação técnica própria.
 */
export function ChannelConnectionStrip({ canal, items }: Props) {
  const conectadas = items.filter((item) => item.pronto || item.status === "conectado").length;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <ChannelLogo canal={canal} variant="pill" size="sm" />

      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        {items.map((item, index) => {
          const conectado = item.pronto || item.status === "conectado";
          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: index * 0.05, ease: [0, 0, 0.2, 1] }}
              className="flex min-h-9 items-center gap-2 rounded-full border border-border px-3 text-xs font-semibold text-foreground"
            >
              <StatusDot conectado={conectado} />
              {isBrandSlug(item.brand) && <BrandLogo brand={item.brand} height={13} />}
              <span className="sr-only">{item.brandLabel}</span>
              <span className="text-[11px] font-medium text-muted-foreground">
                {conectado ? "Ativo" : "Pendente"}
              </span>
            </motion.div>
          );
        })}
      </div>

      <span className="text-[11px] font-semibold text-muted-foreground tabular-nums">
        {conectadas}/{items.length} conectadas
      </span>
    </div>
  );
}
