"use client";

import { BrandLogo } from "@/shared/design-system/primitives/BrandLogo";
import { ChannelLogo } from "@/shared/design-system/primitives/ChannelLogo";
import { isBrandSlug } from "@/shared/config/brands";
import channelsConfig from "@/config/channels.json";

export type ScopeMarca = { brandId: string; nome: string; slug: string; total: number };
export type ScopeCanal = { tipo: string; total: number; conectado: boolean };
export type CardFiltro = { brandId: string; canal: string };

function canalLabel(tipo: string) {
  return (channelsConfig.items as Record<string, { label?: string }>)[tipo]?.label ?? tipo;
}

function Pilula({ ativo, desabilitado, onClick, children }: {
  ativo: boolean;
  desabilitado?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={desabilitado ? undefined : onClick}
      disabled={desabilitado}
      aria-pressed={ativo}
      className={`inline-flex h-6.5 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 text-[11px] font-semibold transition-colors ${
        desabilitado
          ? "cursor-not-allowed border border-border text-muted-foreground opacity-40"
          : ativo
            ? "border-2 border-[#9B30D9] bg-[rgba(155,48,217,.07)] text-foreground"
            : "border border-border text-muted-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

/* ── Filtro de card, sempre visível ───────────────────────────────
   Cada card filtra de forma independente — as pílulas de marca/canal
   ficam expostas numa fileira compacta abaixo do cabeçalho, sem clique
   escondido atrás de um botão. Fecha em "Todas as marcas"/"Todos os
   canais" quando nada está marcado. */
export function ScopeRow({ marcas, canais, filtro, onChange }: {
  marcas: ScopeMarca[];
  canais: ScopeCanal[];
  filtro: CardFiltro;
  onChange: (filtro: CardFiltro) => void;
}) {
  if (marcas.length === 0 && canais.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-border/70 px-5 py-2">
      {marcas.map((marca) => (
        <Pilula
          key={marca.brandId}
          ativo={filtro.brandId === marca.brandId}
          onClick={() => onChange({ ...filtro, brandId: filtro.brandId === marca.brandId ? "" : marca.brandId })}
        >
          {isBrandSlug(marca.slug) ? <BrandLogo brand={marca.slug} height={10} /> : marca.nome}
        </Pilula>
      ))}

      {marcas.length > 0 && canais.length > 0 && (
        <span aria-hidden="true" className="h-4 w-px shrink-0 bg-border" />
      )}

      {canais.map((canal) => (
        <Pilula
          key={canal.tipo}
          ativo={filtro.canal === canal.tipo}
          desabilitado={!canal.conectado}
          onClick={() => onChange({ ...filtro, canal: filtro.canal === canal.tipo ? "" : canal.tipo })}
        >
          <ChannelLogo canal={canal.tipo} size="xs" variant="logo" /> {canalLabel(canal.tipo)}
        </Pilula>
      ))}
    </div>
  );
}
