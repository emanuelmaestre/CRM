"use client";

import { ChannelLogo, channelAccent } from "@/shared/design-system/primitives/ChannelLogo";
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
      className={`inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 transition-colors ${
        ativo ? "border-2" : "border border-border bg-card hover:bg-muted"
      }`}
      style={ativo ? (() => {
        const cor = getBrandConfig(slug)?.color ?? "var(--primary)";
        return { borderColor: cor, background: `color-mix(in srgb, ${cor} 8%, transparent)` };
      })() : undefined}
    >
      {temIdentidade ? <BrandLogo brand={slug} height={17} /> : <span className="text-sm font-semibold text-foreground">{nome}</span>}
      <span className="text-xs tabular-nums text-muted-foreground">{total}</span>
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
      aria-label={label}
      title={label}
      style={ativo ? { borderColor: channelAccent(tipo), background: `color-mix(in srgb, ${channelAccent(tipo)} 8%, transparent)` } : undefined}
      className={`inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3.5 transition-colors ${
        ativo ? "border-2" : "border border-border bg-card hover:bg-muted"
      }`}
    >
      <ChannelLogo canal={tipo} size="sm" variant="logo" />
      <span className="text-xs tabular-nums text-muted-foreground">{total}</span>
    </button>
  );
}

type FiltroEscopoProps = {
  marcasAtivas: ReadonlySet<string>;
  canaisAtivos: ReadonlySet<string>;
  onToggleMarca: (slug: string) => void;
  onToggleCanal: (tipo: string) => void;
  contagemMarca: Record<string, number>;
  contagemCanal: Record<string, number>;
};

export function EmpresasRow({ marcasAtivas, onToggleMarca, contagemMarca }: Pick<FiltroEscopoProps, "marcasAtivas" | "onToggleMarca" | "contagemMarca">) {
  return (
    <div className="flex flex-nowrap items-center gap-2 w-fit">
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
    </div>
  );
}

export function CanaisRow({ canaisAtivos, onToggleCanal, contagemCanal }: Pick<FiltroEscopoProps, "canaisAtivos" | "onToggleCanal" | "contagemCanal">) {
  return (
    <div className="flex flex-nowrap items-center gap-2 w-fit">
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

/** Barra única de escopo Empresa/Canal, compartilhada pelas três abas do
 *  Inbox (Conversas, Perguntas, Avaliações) — antes cada aba tinha a sua
 *  própria, com contagens e seleção independentes; agora escolher uma
 *  empresa ou canal aqui filtra as três ao mesmo tempo. As contagens somam
 *  o que está carregado nas três abas (conversa + pergunta + anúncio), não
 *  o total de cada uma isolada — é um indicador de atividade, não uma
 *  contagem exata de "itens" (que teria naturezas diferentes por aba).
 *  Usada como uma linha só a partir do breakpoint lg; abaixo disso o
 *  Inbox monta EmpresasRow/CanaisRow separadas, empilhadas, porque numa
 *  tela estreita as duas listas de pílulas não cabem lado a lado sem
 *  empurrar uma pra fora da viewport (era o que causava "Karzi" sumir
 *  no mobile: a barra rolava e escondia o resto). */
export function FiltroEscopoBar(props: FiltroEscopoProps) {
  return (
    <div className="flex flex-nowrap items-center gap-2 w-fit">
      <EmpresasRow marcasAtivas={props.marcasAtivas} onToggleMarca={props.onToggleMarca} contagemMarca={props.contagemMarca} />
      <span aria-hidden="true" className="h-7 w-px bg-border flex-shrink-0" />
      <CanaisRow canaisAtivos={props.canaisAtivos} onToggleCanal={props.onToggleCanal} contagemCanal={props.contagemCanal} />
    </div>
  );
}
