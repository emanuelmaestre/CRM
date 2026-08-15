"use client";

import { motion } from "framer-motion";
import { Radar, Rocket, Signal, TrendingUp, Wallet } from "lucide-react";
import type { Oportunidade, TipoOportunidade } from "@/modules/anuncios/application/oportunidades";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { springs } from "@/shared/design-system/motion-variants";
import anunciosConfig from "@/config/anuncios.json";
import { Card, CardHead } from "./anuncios-primitives";
import { tint } from "@/shared/design-system/color";

const copy = anunciosConfig.oportunidades;

const ICONE_TIPO: Record<TipoOportunidade, React.ElementType> = {
  escala: Rocket,
  recuperacao: TrendingUp,
  ranking: Signal,
  orcamento: Wallet,
};

const COR_IMPACTO: Record<Oportunidade["impacto"], string> = {
  alto: "var(--success)",
  medio: "var(--warning)",
  baixo: "var(--muted-foreground)",
};

function LinhaOportunidade({ oportunidade, indice }: { oportunidade: Oportunidade; indice: number }) {
  const Icon = ICONE_TIPO[oportunidade.tipo];
  const corImpacto = COR_IMPACTO[oportunidade.impacto];

  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...springs.settleFast, delay: indice * 0.05 }}
      className="rounded-[1rem] border border-border p-3.5"
    >
      <div className="flex items-start gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
          <Icon size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] font-semibold text-foreground">{oportunidade.campanhaNome}</p>
            <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ background: tint(corImpacto, 9), color: corImpacto }}>
              impacto {oportunidade.impacto}
            </span>
          </div>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {copy.tipos[oportunidade.tipo]}
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-foreground">{oportunidade.explicacao}</p>
          <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {oportunidade.criterios.map((criterio) => (
              <li key={criterio} className="text-[10px] text-muted-foreground before:mr-1 before:content-['•']">{criterio}</li>
            ))}
          </ul>
        </div>
      </div>
    </motion.li>
  );
}

export function OportunidadesCard({ oportunidades }: { oportunidades: Oportunidade[] }) {
  return (
    <Card>
      <CardHead title={copy.titulo} icon={Radar} accent="var(--acento-3)" />
      {oportunidades.length === 0 ? (
        <EmptyState illustration="generic" title={copy.vazio} description={copy.vazioDescricao} />
      ) : (
        <ul className="flex flex-col gap-2.5 px-4 pb-5 pt-3 sm:px-5">
          {oportunidades.slice(0, 6).map((oportunidade, indice) => (
            <LinhaOportunidade key={`${oportunidade.campanhaId}-${oportunidade.tipo}`} oportunidade={oportunidade} indice={indice} />
          ))}
        </ul>
      )}
    </Card>
  );
}
