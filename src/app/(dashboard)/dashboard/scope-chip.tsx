"use client";

import { useEffect, useRef, useState } from "react";
import { Filter, ChevronDown } from "lucide-react";
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

function pillClass(ativo: boolean) {
  return `inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[12px] font-semibold transition-colors ${
    ativo
      ? "border-2 border-[#9B30D9] bg-[rgba(155,48,217,.07)] text-foreground"
      : "border border-border text-muted-foreground hover:bg-muted"
  }`;
}

/* ── Escopo por card ───────────────────────────────────────────
   Cada card do Painel filtra de forma independente — sem herdar de um
   controle global. Fechado mostra só um chip discreto ("Todas as
   marcas" ou o nome de quem está selecionado); abrir revela as mesmas
   pílulas de marca/canal do resto do sistema, só que aplicadas a este
   card sozinho. */
export function ScopeChip({ marcas, canais, filtro, onChange }: {
  marcas: ScopeMarca[];
  canais: ScopeCanal[];
  filtro: CardFiltro;
  onChange: (filtro: CardFiltro) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    function aoClicarFora(evento: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(evento.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, [aberto]);

  const marcaAtiva = marcas.find((item) => item.brandId === filtro.brandId);
  const canalAtivo = canais.find((item) => item.tipo === filtro.canal);
  const semFiltro = !filtro.brandId && !filtro.canal;
  const rotulo = marcaAtiva?.nome ?? (canalAtivo ? canalLabel(canalAtivo.tipo) : null);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setAberto((atual) => !atual)}
        aria-expanded={aberto}
        aria-label="Filtrar este card por marca ou canal"
        className={pillClass(!semFiltro)}
      >
        <Filter size={12} strokeWidth={2.25} />
        {semFiltro ? "Todas as marcas" : rotulo}
        <ChevronDown size={11} className={aberto ? "rotate-180 transition-transform" : "transition-transform"} />
      </button>

      {aberto && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-20 w-60 rounded-xl border border-border bg-card p-2.5 shadow-[0_8px_24px_rgba(14,15,19,.12)]">
          <p className="px-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Marca</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {marcas.map((marca) => (
              <button
                key={marca.brandId}
                type="button"
                onClick={() => onChange({ ...filtro, brandId: filtro.brandId === marca.brandId ? "" : marca.brandId })}
                className={pillClass(filtro.brandId === marca.brandId)}
              >
                {isBrandSlug(marca.slug) ? <BrandLogo brand={marca.slug} height={11} /> : marca.nome}
              </button>
            ))}
          </div>

          {canais.length > 0 && (
            <>
              <p className="mt-2.5 px-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Canal</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {canais.map((canal) => (
                  <button
                    key={canal.tipo}
                    type="button"
                    disabled={!canal.conectado}
                    onClick={() => onChange({ ...filtro, canal: filtro.canal === canal.tipo ? "" : canal.tipo })}
                    className={`${pillClass(filtro.canal === canal.tipo)} ${!canal.conectado ? "cursor-not-allowed opacity-40" : ""}`}
                  >
                    <ChannelLogo canal={canal.tipo} size="xs" variant="logo" /> {canalLabel(canal.tipo)}
                  </button>
                ))}
              </div>
            </>
          )}

          {!semFiltro && (
            <button
              type="button"
              onClick={() => { onChange({ brandId: "", canal: "" }); setAberto(false); }}
              className="mt-2.5 w-full rounded-lg border border-border px-2 py-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted"
            >
              Limpar filtro deste card
            </button>
          )}
        </div>
      )}
    </div>
  );
}
