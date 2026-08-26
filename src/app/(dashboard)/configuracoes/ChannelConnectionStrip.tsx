"use client";

import { motion, useReducedMotion } from "framer-motion";
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
  const reduzir = useReducedMotion();

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <ChannelLogo canal={canal} variant="pill" size="sm" />

      {/* No celular o contador sobe para a linha do canal (`order-1`, antes
          das marcas): sozinho numa terceira linha ele gastava altura para
          dizer uma coisa curta que cabia de sobra ao lado do nome. No
          desktop volta ao fim da fileira, como sempre esteve. */}
      <span className="order-1 text-[11px] font-semibold tabular-nums text-muted-foreground sm:order-last">
        {conectadas}/{items.length} conectadas
      </span>

      <div className="order-2 flex min-w-0 flex-1 basis-full flex-wrap items-center gap-2 sm:order-none sm:basis-auto">
        {items.map((item, index) => {
          const conectado = item.pronto || item.status === "conectado";
          return (
            <motion.div
              key={item.id}
              initial={reduzir ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduzir ? { duration: 0 } : { duration: 0.22, delay: index * 0.05, ease: [0, 0, 0.2, 1] }}
              className="flex min-h-9 shrink-0 items-center gap-2 rounded-full border border-border px-3 text-xs font-semibold text-foreground"
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
    </div>
  );
}
