"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { AlertOctagon, CheckCircle2, Sparkles } from "lucide-react";
import type { Alerta, GrupoAlertas } from "@/modules/anuncios/application/alertas";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { fadeUp, springs } from "@/shared/design-system/motion-variants";
import anunciosConfig from "@/config/anuncios.json";
import { Card, CardHead } from "./anuncios-primitives";

const copy = anunciosConfig.atencao;

export const COR_PRIORIDADE: Record<Alerta["prioridade"], string> = {
  critico: "#C21820",
  importante: "#E8590C",
  oportunidade: "#1F8A4C",
  informativo: "#2563EB",
};

export const EMOJI_PRIORIDADE: Record<Alerta["prioridade"], string> = {
  critico: "🔴",
  importante: "🟡",
  oportunidade: "🟢",
  informativo: "🔵",
};

export function LinhaAlerta({ alerta, indice }: { alerta: Alerta; indice: number }) {
  const cor = COR_PRIORIDADE[alerta.prioridade];
  return (
    <motion.li
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ ...springs.settleFast, delay: indice * 0.05 }}
      className="flex items-start gap-2.5 rounded-[0.9rem] border border-border p-3"
      style={{ borderLeft: `3px solid ${cor}` }}
    >
      <span className="mt-0.5 text-sm leading-none">{EMOJI_PRIORIDADE[alerta.prioridade]}</span>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-foreground">{alerta.campanhaNome}</p>
        <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{alerta.descricao}</p>
      </div>
    </motion.li>
  );
}

export function LinhaGrupo({ grupo, indice }: { grupo: GrupoAlertas; indice: number }) {
  const cor = COR_PRIORIDADE[grupo.prioridade];
  return (
    <motion.li
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ ...springs.settleFast, delay: indice * 0.05 }}
      className="flex items-start gap-2.5 rounded-[0.9rem] border border-border p-3"
      style={{ borderLeft: `3px solid ${cor}` }}
    >
      <span className="mt-0.5 text-sm leading-none">{EMOJI_PRIORIDADE[grupo.prioridade]}</span>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-foreground">
          {grupo.alertas.length} campanhas · {grupo.tituloBase}
        </p>
        <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
          {grupo.alertas.map((a) => a.campanhaNome).join(", ")}
        </p>
      </div>
    </motion.li>
  );
}

export function AtencaoCard({ individuais, grupos }: { individuais: Alerta[]; grupos: GrupoAlertas[] }) {
  const total = individuais.length + grupos.length;
  const criticos = individuais.filter((a) => a.prioridade === "critico").length
    + grupos.filter((g) => g.prioridade === "critico").length;
  const oportunidades = individuais.filter((a) => a.prioridade === "oportunidade").length
    + grupos.filter((g) => g.prioridade === "oportunidade").length;

  return (
    <Card>
      <CardHead
        title={copy.titulo}
        subtitle={total > 0 ? `${criticos} crítico${criticos !== 1 ? "s" : ""} · ${oportunidades} oportunidade${oportunidades !== 1 ? "s" : ""}` : undefined}
        icon={total > 0 ? AlertOctagon : CheckCircle2}
        accent={total > 0 ? "#C21820" : "#1F8A4C"}
      />
      {total === 0 ? (
        <EmptyState illustration="generic" title={copy.vazio} description={copy.vazioDescricao} />
      ) : (
        <motion.ul variants={fadeUp} className="flex flex-col gap-2 px-4 pb-5 pt-3 sm:px-5">
          {[...individuais].slice(0, 5).map((alerta, indice) => (
            <LinhaAlerta key={alerta.chave} alerta={alerta} indice={indice} />
          ))}
          {grupos.slice(0, 3).map((grupo, indice) => (
            <LinhaGrupo key={grupo.tituloBase} grupo={grupo} indice={indice + individuais.length} />
          ))}
        </motion.ul>
      )}
      {total > 0 && (
        <Link
          href="/anuncios/alertas"
          className="flex items-center gap-1.5 border-t border-border px-4 py-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground sm:px-5"
        >
          <Sparkles size={11} /> {total > 5 ? `+${total - 5} outros — ` : ""}{copy.verTodas} →
        </Link>
      )}
    </Card>
  );
}
