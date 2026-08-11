"use client";

import { Building2, Radio } from "lucide-react";
import { ChannelLogo } from "@/shared/design-system/primitives/ChannelLogo";
import { BrandLogo } from "@/shared/design-system/primitives/BrandLogo";
import { getBrandConfig, isBrandSlug, BRAND_SLUGS } from "@/shared/config/brands";
import channelsConfig from "@/config/channels.json";

export const CANAIS_VENDA = ["mercadolivre", "shopee", "tiktokshop"] as const;

function EmpresaPill({ nome, slug, total, ativo, onClick }: {
  nome: string; slug: string; total: number; ativo: boolean; onClick: () => void;
}) {
  const temIdentidade = isBrandSlug(slug);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={`inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3.5 transition-colors ${
        ativo ? "border-2 bg-card" : "border border-border bg-card hover:bg-muted"
      }`}
      style={ativo ? { borderColor: getBrandConfig(slug)?.color ?? "var(--primary)" } : undefined}
    >
      {temIdentidade ? <BrandLogo brand={slug} height={13} /> : <span className="text-[13px] font-semibold text-foreground">{nome}</span>}
      <span className="text-[11px] tabular-nums text-muted-foreground">{total}</span>
    </button>
  );
}

function CanalFiltroPill({ tipo, total, ativo, onClick }: {
  tipo: string; total: number; ativo: boolean; onClick: () => void;
}) {
  const label = (channelsConfig.items as Record<string, { label?: string }>)[tipo]?.label ?? tipo;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={`inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3.5 transition-colors ${
        ativo ? "border-2 border-[#9B30D9] bg-[rgba(155,48,217,.07)]" : "border border-border bg-card hover:bg-muted"
      }`}
    >
      <ChannelLogo canal={tipo} size="xs" variant="logo" />
      <span className="text-[13px] font-semibold text-foreground">{label}</span>
      <span className="text-[11px] tabular-nums text-muted-foreground">{total}</span>
    </button>
  );
}

/** Barra única de escopo Empresa/Canal, compartilhada pelas três abas do
 *  Inbox (Conversas, Perguntas, Avaliações) — antes cada aba tinha a sua
 *  própria, com contagens e seleção independentes; agora escolher uma
 *  empresa ou canal aqui filtra as três ao mesmo tempo. As contagens somam
 *  o que está carregado nas três abas (conversa + pergunta + anúncio), não
 *  o total de cada uma isolada — é um indicador de atividade, não uma
 *  contagem exata de "itens" (que teria naturezas diferentes por aba). */
export function FiltroEscopoBar({
  marcasAtivas, canaisAtivos, onToggleMarca, onToggleCanal, contagemMarca, contagemCanal,
}: {
  marcasAtivas: ReadonlySet<string>;
  canaisAtivos: ReadonlySet<string>;
  onToggleMarca: (slug: string) => void;
  onToggleCanal: (tipo: string) => void;
  contagemMarca: Record<string, number>;
  contagemCanal: Record<string, number>;
}) {
  return (
    <div className="flex flex-nowrap items-center gap-2 rounded-full border border-border/60 bg-card px-3.5 py-2 shadow-[0_2px_10px_rgba(14,15,19,.04)] w-fit">
      <span className="inline-flex flex-shrink-0 items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Building2 size={12} strokeWidth={2.25} /> Empresa
      </span>
      {BRAND_SLUGS.map((slug) => (
        <EmpresaPill
          key={slug}
          nome={getBrandConfig(slug)?.label ?? slug}
          slug={slug}
          total={contagemMarca[slug] ?? 0}
          ativo={marcasAtivas.has(slug)}
          onClick={() => onToggleMarca(slug)}
        />
      ))}

      <span aria-hidden="true" className="h-5 w-px bg-border flex-shrink-0" />

      <span className="inline-flex flex-shrink-0 items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Radio size={12} strokeWidth={2.25} /> Canal
      </span>
      {CANAIS_VENDA.map((tipo) => (
        <CanalFiltroPill
          key={tipo}
          tipo={tipo}
          total={contagemCanal[tipo] ?? 0}
          ativo={canaisAtivos.has(tipo)}
          onClick={() => onToggleCanal(tipo)}
        />
      ))}
    </div>
  );
}
