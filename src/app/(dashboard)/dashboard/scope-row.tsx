"use client";

import { BrandLogo } from "@/shared/design-system/primitives/BrandLogo";
import { ChannelLogo, channelAccent } from "@/shared/design-system/primitives/ChannelLogo";
import { getBrandConfig, isBrandSlug } from "@/shared/config/brands";
import channelsConfig from "@/config/channels.json";

export type ScopeMarca = { brandId: string; nome: string; slug: string; total: number };
export type ScopeCanal = { tipo: string; total: number; conectado: boolean };
export type CardFiltro = { brandId: string[]; canal: string[] };

function alternar(lista: string[], valor: string): string[] {
  return lista.includes(valor) ? lista.filter((item) => item !== valor) : [...lista, valor];
}

function canalLabel(tipo: string) {
  return (channelsConfig.items as Record<string, { label?: string }>)[tipo]?.label ?? tipo;
}

/** Converte "var(--karzi)" ou "#RRGGBB" num valor utilizável em rgba() para o
 *  fundo tingido — var(--x) não entra em color-mix em todo navegador suportado,
 *  então o fundo usa a mesma cor em baixa opacidade via CSS var diretamente. */
function corAtiva(cor: string) {
  return { borderColor: cor, background: `color-mix(in srgb, ${cor} 8%, transparent)` };
}

function Pilula({ ativo, desabilitado, onClick, rotulo, iconOnly, accent, children }: {
  ativo: boolean;
  desabilitado?: boolean;
  onClick: () => void;
  rotulo?: string;
  iconOnly?: boolean;
  /** Cor de identidade (marca ou canal) usada quando selecionado — cada pílula
   *  tinge com a própria cor em vez de todas ficarem roxas. */
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={desabilitado ? undefined : onClick}
      disabled={desabilitado}
      aria-pressed={ativo}
      aria-label={rotulo}
      title={rotulo}
      style={ativo && !desabilitado && accent ? corAtiva(accent) : undefined}
      className={`inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-full transition-colors ${iconOnly ? "px-3" : "px-3.5"} text-[13px] font-semibold ${
        desabilitado
          ? "cursor-not-allowed border border-border text-muted-foreground opacity-40"
          : ativo
            ? "border-2 text-foreground"
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
    <>
      {marcas.map((marca) => (
        <Pilula
          key={marca.brandId}
          ativo={filtro.brandId.includes(marca.brandId)}
          onClick={() => onChange({ ...filtro, brandId: alternar(filtro.brandId, marca.brandId) })}
          accent={isBrandSlug(marca.slug) ? getBrandConfig(marca.slug)?.color : undefined}
        >
          {isBrandSlug(marca.slug) ? <BrandLogo brand={marca.slug} height={17} /> : marca.nome}
        </Pilula>
      ))}

      {marcas.length > 0 && canais.length > 0 && (
        <span aria-hidden="true" className="h-4 w-px shrink-0 bg-border" />
      )}

      {canais.map((canal) => (
        <Pilula
          key={canal.tipo}
          ativo={filtro.canal.includes(canal.tipo)}
          desabilitado={!canal.conectado}
          onClick={() => onChange({ ...filtro, canal: alternar(filtro.canal, canal.tipo) })}
          rotulo={canalLabel(canal.tipo)}
          iconOnly
          accent={channelAccent(canal.tipo)}
        >
          <ChannelLogo canal={canal.tipo} size="sm" variant="logo" />
        </Pilula>
      ))}
    </>
  );
}
