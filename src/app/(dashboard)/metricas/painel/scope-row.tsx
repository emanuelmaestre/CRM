"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
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

function HaloSelecao({ cor }: { cor: string }) {
  const reduzMovimento = useReducedMotion();
  return (
    <AnimatePresence>
      <motion.span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{ boxShadow: `0 0 0 1px ${cor}` }}
        initial={{ opacity: 0, scale: 1 }}
        animate={reduzMovimento ? { opacity: 0.35 } : { opacity: [0.35, 0, 0.35], scale: [1, 1.18, 1] }}
        transition={reduzMovimento ? undefined : { duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
      />
    </AnimatePresence>
  );
}

function Pilula({ ativo, desabilitado, onClick, rotulo, accent, total, children }: {
  ativo: boolean;
  desabilitado?: boolean;
  onClick: () => void;
  rotulo?: string;
  /** Cor de identidade (marca ou canal) usada quando selecionado — cada pílula
   *  tinge com a própria cor em vez de todas ficarem roxas. */
  accent?: string;
  total?: number;
  children: React.ReactNode;
}) {
  const reduzMovimento = useReducedMotion();
  return (
    <motion.button
      type="button"
      onClick={desabilitado ? undefined : onClick}
      disabled={desabilitado}
      aria-pressed={ativo}
      aria-label={rotulo}
      title={rotulo}
      whileHover={desabilitado ? undefined : { scale: reduzMovimento ? 1 : 1.03 }}
      whileTap={desabilitado ? undefined : { scale: reduzMovimento ? 1 : 0.97 }}
      style={ativo && !desabilitado && accent ? { borderColor: accent, color: accent } : undefined}
      className={`relative inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-card/70 px-3.5 transition-colors text-[13px] font-semibold ${
        desabilitado
          ? "cursor-not-allowed border border-border text-muted-foreground opacity-40"
          : ativo
            ? "border-2 font-bold"
            : "border border-border/80 bg-card/40 text-muted-foreground hover:bg-card/70"
      }`}
    >
      {ativo && !desabilitado && accent && <HaloSelecao cor={accent} />}
      {children}
      {typeof total === "number" && (
        <span className="text-xs tabular-nums text-muted-foreground">{total}</span>
      )}
    </motion.button>
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
          total={marca.total}
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
          accent={channelAccent(canal.tipo)}
          total={canal.total}
        >
          <ChannelLogo canal={canal.tipo} size="sm" variant="logo" />
        </Pilula>
      ))}
    </>
  );
}
