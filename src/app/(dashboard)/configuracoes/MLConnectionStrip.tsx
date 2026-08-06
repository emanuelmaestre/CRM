"use client";

import { motion } from "framer-motion";
import { RefreshCw } from "lucide-react";
import { BrandLogo } from "@/shared/design-system/primitives/BrandLogo";
import settingsConfig from "@/config/settings.json";
import { isBrandSlug, type BrandSlug } from "@/shared/config/brands";
import type { MercadoLivreStatus } from "./useMercadoLivreStatus";

const mlConfig = settingsConfig.mercadoLivre;
const labels = mlConfig.labels;

const VERDE = "#1F8A4C";

/**
 * Ilustração do vínculo OAuth: três marcas ligadas a um hub do marketplace.
 * O pulso só percorre a linha quando existe pelo menos uma conta conectada —
 * a faixa fica "viva" quando há sincronização de verdade e estática quando não.
 */
function ConexaoIllustration({ ativo }: { ativo: boolean }) {
  return (
    <svg width="56" height="40" viewBox="0 0 56 40" fill="none" aria-hidden="true" className="shrink-0">
      <path
        d="M10 8h10c8 0 8 12 16 12M10 20h10c8 0 8 0 16 0M10 32h10c8 0 8-12 16-12"
        stroke="var(--border)"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="8" cy="8" r="3" fill="var(--muted)" stroke="var(--border)" strokeWidth="1.5" />
      <circle cx="8" cy="20" r="3" fill="var(--muted)" stroke="var(--border)" strokeWidth="1.5" />
      <circle cx="8" cy="32" r="3" fill="var(--muted)" stroke="var(--border)" strokeWidth="1.5" />

      {ativo && (
        <motion.path
          d="M10 20h10c8 0 8 0 16 0"
          stroke="url(#ml-strip-grad)"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
          strokeDasharray="6 30"
          animate={{ strokeDashoffset: [36, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
        />
      )}

      <circle
        cx="44"
        cy="20"
        r="9"
        fill={ativo ? "#FFE600" : "var(--muted)"}
        stroke={ativo ? "#E6CF00" : "var(--border)"}
        strokeWidth="1.5"
      />
      <path
        d="M39.5 21.5c2-4 3.5-4 4.5-1.5s2.5 2.5 4.5-1.5"
        stroke={ativo ? "#1a1a00" : "var(--muted-foreground)"}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <defs>
        <linearGradient id="ml-strip-grad" x1="10" y1="20" x2="36" y2="20" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E3131B" />
          <stop offset="1" stopColor="#9B30D9" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** Bolinha de status: ganha halo pulsante quando a marca está conectada. */
function StatusDot({ conectado, alerta }: { conectado: boolean; alerta: boolean }) {
  const cor = alerta ? "#B57A00" : conectado ? VERDE : "var(--muted-foreground)";
  return (
    <span className="relative flex h-2 w-2 shrink-0 items-center justify-center">
      {conectado && !alerta && (
        <motion.span
          className="absolute inset-0 rounded-full"
          style={{ background: cor }}
          animate={{ scale: [1, 2.2, 1], opacity: [0.45, 0, 0.45] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
        />
      )}
      <span className="relative h-2 w-2 rounded-full" style={{ background: cor }} />
    </span>
  );
}

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
      <ConexaoIllustration ativo={!carregando && conectadas > 0} />

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
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
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
