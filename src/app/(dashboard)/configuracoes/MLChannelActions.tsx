"use client";

import { motion } from "framer-motion";
import { AlertTriangle, ExternalLink } from "lucide-react";
import settingsConfig from "@/config/settings.json";
import type { BrandSlug } from "@/shared/config/brands";
import type { MercadoLivreStatus } from "./useMercadoLivreStatus";

const labels = settingsConfig.mercadoLivre.labels;

interface Props {
  slug: BrandSlug;
  brandLabel: string;
  status: MercadoLivreStatus;
}

/**
 * Rodapé OAuth do card de canal do Mercado Livre. Os demais canais usam
 * credenciais no ambiente; só o ML precisa do fluxo de autorização, então a
 * ação vive aqui — junto do status da conta — em vez de num bloco separado.
 */
export function MLChannelActions({ slug, brandLabel, status }: Props) {
  const { detalhes, carregando, desconectando, desconectar } = status;
  const detalhe = detalhes[slug];
  const conectado = detalhe?.conectado ?? false;
  const contaErrada = conectado && detalhe?.contaConfere === false;
  const ocupado = desconectando === slug;

  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          {carregando
            ? labels.loading
            : conectado
              ? `${labels.connected}${detalhe?.sellerId ? ` · ${labels.sellerPrefix} ${detalhe.sellerId}` : ""}`
              : labels.disconnected}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {!carregando && conectado && (
            <button
              type="button"
              onClick={() => void desconectar(slug, brandLabel)}
              disabled={ocupado}
              className="rounded-lg border border-destructive/30 px-3 py-1.5 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
            >
              {ocupado ? labels.disconnecting : labels.disconnect}
            </button>
          )}

          <motion.a
            href={`/api/ml/connect?brand=${slug}`}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm"
            style={{
              background: conectado ? "var(--muted)" : "#FFE600",
              color: conectado ? "var(--muted-foreground)" : "#1a1a00",
            }}
          >
            {conectado ? labels.reconnect : labels.connect}
            <ExternalLink size={10} strokeWidth={2.5} />
          </motion.a>
        </div>
      </div>

      {contaErrada && (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-warning/10 px-2.5 py-2 text-[11px] font-medium text-warning">
          <AlertTriangle size={13} strokeWidth={2} className="mt-px shrink-0" />
          <span>{labels.mismatch}</span>
        </p>
      )}
    </div>
  );
}
