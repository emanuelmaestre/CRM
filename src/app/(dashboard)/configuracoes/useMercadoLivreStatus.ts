"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import settingsConfig from "@/config/settings.json";
import type { BrandSlug } from "@/shared/config/brands";

/** Espelha o retorno de /api/ml/status: booleano plano por marca + detalhes. */
export type DetalheMarcaML = { conectado: boolean; sellerId?: string; contaConfere?: boolean };
type RespostaStatus = Partial<Record<BrandSlug, boolean>> & {
  detalhes?: Partial<Record<BrandSlug, DetalheMarcaML>>;
};

const labels = settingsConfig.mercadoLivre.labels;

export interface MercadoLivreStatus {
  detalhes: Partial<Record<BrandSlug, DetalheMarcaML>>;
  carregando: boolean;
  desconectando: BrandSlug | null;
  atualizar: () => Promise<void>;
  desconectar: (slug: BrandSlug, label: string) => Promise<void>;
}

/**
 * Estado único do vínculo OAuth com o Mercado Livre. Fica no topo da página
 * porque a faixa-resumo e os cards de canal mostram a mesma informação: manter
 * dois fetches separados era o que deixava os dois blocos divergirem.
 */
export function useMercadoLivreStatus(
  aoMudar?: () => void,
  detalhesIniciais?: Partial<Record<BrandSlug, DetalheMarcaML>>,
): MercadoLivreStatus {
  const [detalhes, setDetalhes] = useState<Partial<Record<BrandSlug, DetalheMarcaML>>>(detalhesIniciais ?? {});
  const [carregando, setCarregando] = useState(detalhesIniciais === undefined);
  const [desconectando, setDesconectando] = useState<BrandSlug | null>(null);

  // Sem setState síncrono: o primeiro render já nasce com carregando = true.
  const buscar = useCallback(async () => {
    try {
      const res = await fetch("/api/ml/status");
      if (!res.ok) return;
      const dados = (await res.json()) as RespostaStatus;
      setDetalhes(dados.detalhes ?? {});
    } finally {
      setCarregando(false);
    }
  }, []);

  const atualizar = useCallback(async () => {
    setCarregando(true);
    await buscar();
  }, [buscar]);

  useEffect(() => {
    if (detalhesIniciais === undefined) void buscar();
  }, [buscar, detalhesIniciais]);

  const desconectar = useCallback(async (slug: BrandSlug, label: string) => {
    if (!window.confirm(labels.confirmDisconnect.replace("{brand}", label))) return;
    setDesconectando(slug);
    try {
      const res = await fetch(`/api/ml/disconnect?brand=${slug}`, { method: "POST" });
      if (!res.ok) throw new Error(labels.disconnect_error);
      toast.success(labels.disconnected_ok.replace("{brand}", label));
      await buscar();
      // O disconnect também grava channel_account: o grid precisa reler.
      aoMudar?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : labels.disconnect_error);
    } finally {
      setDesconectando(null);
    }
  }, [buscar, aoMudar]);

  return { detalhes, carregando, desconectando, atualizar, desconectar };
}
