"use client";

import { motion } from "framer-motion";
import { RefreshCw } from "lucide-react";
import { BrandLogo } from "@/shared/design-system/primitives/BrandLogo";
import { ChannelLogo } from "@/shared/design-system/primitives/ChannelLogo";
import settingsConfig from "@/config/settings.json";
import { isBrandSlug, type BrandSlug } from "@/shared/config/brands";
import { StatusDot } from "./StatusDot";
import type { MercadoLivreStatus } from "./useMercadoLivreStatus";

const mlConfig = settingsConfig.mercadoLivre;
const labels = mlConfig.labels;

interface Props {
  status: MercadoLivreStatus;
}

/**
 * Faixa-resumo do Mercado Livre: indicador puro, sem interação. Conectar,
 * reconectar e desconectar moram na linha do canal, para existir um único lugar
 * de ação por conta.
 */
export function MLConnectionStrip({ status }: Props) {
  const { detalhes, carregando, atualizar } = status;

  const marcas = mlConfig.brands.filter((item) => isBrandSlug(item.slug));
  const conectadas = marcas.filter((item) => detalhes[item.slug as BrandSlug]?.conectado).length;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <ChannelLogo canal="mercadolivre" variant="pill" size="sm" />

      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        {marcas.map(({ slug: rawSlug, label }, index) => {
          const slug = rawSlug as BrandSlug;
          const detalhe = detalhes[slug];
          const conectado = detalhe?.conectado ?? false;
          // contaConfere só vem quando ML_SELLER_ID_<MARCA> está configurado.
          const alerta = conectado && detalhe?.contaConfere === false;

          return (
            <motion.div
              key={slug}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: index * 0.05, ease: [0, 0, 0.2, 1] }}
              className="flex min-h-9 items-center gap-2 rounded-full border border-border px-3 text-xs font-semibold text-foreground"
            >
              <StatusDot conectado={conectado} alerta={alerta} />
              <BrandLogo brand={slug} height={13} />
              <span className="sr-only">{label}</span>
              <span className="text-[11px] font-medium text-muted-foreground">
                {carregando ? labels.loading : conectado ? labels.active : labels.pending}
              </span>
            </motion.div>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold text-muted-foreground tabular-nums">
          {carregando ? labels.loading : `${conectadas}/${marcas.length} conectadas`}
        </span>
        <button
          type="button"
          onClick={() => void atualizar()}
          disabled={carregando}
          title={labels.refresh}
          aria-label={labels.refresh}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          <motion.span
            animate={carregando ? { rotate: 360 } : { rotate: 0 }}
            transition={carregando ? { duration: 0.9, repeat: Infinity, ease: "linear" } : { duration: 0.2 }}
            className="flex"
          >
            <RefreshCw size={13} strokeWidth={2} />
          </motion.span>
        </button>
      </div>
    </div>
  );
}
