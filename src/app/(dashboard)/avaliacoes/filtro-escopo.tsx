"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChannelLogo, channelAccent } from "@/shared/design-system/primitives/ChannelLogo";
import { BrandLogo } from "@/shared/design-system/primitives/BrandLogo";
import { getBrandConfig, isBrandSlug, BRAND_SLUGS } from "@/shared/config/brands";
import channelsConfig from "@/config/channels.json";

export const CANAIS_VENDA = ["mercadolivre", "shopee", "tiktokshop"] as const;

/** Anel na cor da pílula que nasce colado nela e se expande sumindo — só
 *  toca quando `ativo` PASSA a ser true. Mesmo componente usado em Estoque/
 *  Publicidade, pro selecionar de marca/canal ter a mesma linguagem visual
 *  em todo o app. */
function HaloSelecao({ ativo, cor, reduzir }: { ativo: boolean; cor: string; reduzir: boolean | null }) {
  return (
    <AnimatePresence>
      {ativo && !reduzir && (
        <motion.span
          key="halo"
          initial={{ opacity: 0.55, scale: 0.82 }}
          animate={{ opacity: 0, scale: 1.4 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{ border: `2px solid ${cor}` }}
        />
      )}
    </AnimatePresence>
  );
}

function EmpresaPill({ nome, slug, ativo, onClick }: {
  nome: string; slug: string; ativo: boolean; onClick: () => void;
}) {
  const reduzir = useReducedMotion();
  const temIdentidade = isBrandSlug(slug);
  const cor = getBrandConfig(slug)?.color ?? "var(--muted-foreground)";
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      whileHover={!reduzir ? { y: -2, scale: 1.04 } : undefined}
      whileTap={!reduzir ? { scale: 0.92 } : undefined}
      className={`relative inline-flex h-11 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-full px-4 transition-colors ${
        ativo ? "border-2 bg-card/70" : "border border-border/80 bg-card/40 hover:bg-card/70"
      }`}
      style={ativo ? { borderColor: cor } : undefined}
    >
      <HaloSelecao ativo={ativo} cor={cor} reduzir={reduzir} />
      {temIdentidade ? <BrandLogo brand={slug} height={17} /> : <span className="text-sm font-semibold text-foreground">{nome}</span>}
    </motion.button>
  );
}

function CanalFiltroPill({ tipo, ativo, onClick }: {
  tipo: string; ativo: boolean; onClick: () => void;
}) {
  const reduzir = useReducedMotion();
  const label = (channelsConfig.items as Record<string, { label?: string }>)[tipo]?.label ?? tipo;
  const cor = channelAccent(tipo);
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      aria-label={label}
      title={label}
      whileHover={!reduzir ? { y: -2, scale: 1.04 } : undefined}
      whileTap={!reduzir ? { scale: 0.92 } : undefined}
      className={`relative inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 transition-colors ${
        ativo ? "border-2 bg-card/70" : "border border-border/80 bg-card/40 hover:bg-card/70"
      }`}
      style={ativo ? { borderColor: cor } : undefined}
    >
      <HaloSelecao ativo={ativo} cor={cor} reduzir={reduzir} />
      <ChannelLogo canal={tipo} size="sm" variant="logo" />
    </motion.button>
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
          ativo={canaisAtivos.has(tipo)}
          onClick={() => onToggleCanal(tipo)}
        />
      ))}
    </div>
  );
}

/** Barra de escopo Empresa/Canal do módulo Avaliações. Já foi compartilhada
 *  com as abas Conversas/Perguntas do Inbox — essas duas telas não existem
 *  mais no app, então hoje isso é usado só aqui. Usada como uma linha só a
 *  partir do breakpoint lg; abaixo disso a tela monta EmpresasRow/CanaisRow
 *  separadas, empilhadas, porque numa tela estreita as duas listas de
 *  pílulas não cabem lado a lado sem empurrar uma pra fora da viewport. */
export function FiltroEscopoBar(props: FiltroEscopoProps) {
  return (
    <div className="flex flex-nowrap items-center gap-2 w-fit">
      <EmpresasRow marcasAtivas={props.marcasAtivas} onToggleMarca={props.onToggleMarca} contagemMarca={props.contagemMarca} />
      <span aria-hidden="true" className="h-7 w-px bg-border flex-shrink-0" />
      <CanaisRow canaisAtivos={props.canaisAtivos} onToggleCanal={props.onToggleCanal} contagemCanal={props.contagemCanal} />
    </div>
  );
}
