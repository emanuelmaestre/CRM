"use client";

import { motion } from "framer-motion";
import { BarChart3 } from "lucide-react";
import type { CampanhaVisaoGeral } from "@/modules/anuncios/application/visao-geral.service";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { springs } from "@/shared/design-system/motion-variants";
import anunciosConfig from "@/config/anuncios.json";
import { Card, CardHead } from "./anuncios-primitives";
import { Roas } from "./roas";
import { tint } from "@/shared/design-system/color";

const copy = anunciosConfig.campanhas;
const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const STATUS_LABEL: Record<string, { label: string; cor: string }> = {
  active: { label: "Ativa", cor: "var(--success)" },
  paused: { label: "Pausada", cor: "var(--warning)" },
};

function BadgeStatus({ status }: { status: string }) {
  const info = STATUS_LABEL[status] ?? { label: status, cor: "var(--muted-foreground)" };
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: tint(info.cor, 9), color: info.cor }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: info.cor }} />
      {info.label}
    </span>
  );
}

export function CampanhasCard({ campanhas }: { campanhas: CampanhaVisaoGeral[] }) {
  return (
    <Card>
      <CardHead title={copy.titulo} subtitle={copy.subtitulo} icon={BarChart3} accent="var(--acento-2)" />
      {campanhas.length === 0 ? (
        <EmptyState illustration="reports" title={copy.semDado} />
      ) : (
        <>
        <div className="divide-y divide-border px-4 pb-4 pt-2 md:hidden">
          {campanhas.map((campanha) => {
            const lucroPositivo = campanha.lucro.lucroEstimado >= 0;
            return (
              <article key={campanha.campanhaId} className="py-4 first:pt-2 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <h4 className="min-w-0 text-sm font-semibold leading-snug text-foreground">{campanha.nome}</h4>
                  <BadgeStatus status={campanha.status} />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div><dt className="text-xs text-muted-foreground">Investimento</dt><dd className="mt-0.5 font-semibold tabular-nums">{moeda.format(campanha.investimento)}</dd></div>
                  <div className="text-right"><dt className="text-xs text-muted-foreground">Receita</dt><dd className="mt-0.5 font-semibold tabular-nums">{moeda.format(campanha.receita)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">ROAS</dt><dd className="mt-0.5 font-semibold"><Roas valor={campanha.roas} minimo={campanha.breakEven.roasMinimo} /></dd></div>
                  <div className="text-right"><dt className="text-xs text-muted-foreground">Lucro estimado</dt><dd className="mt-0.5 font-semibold tabular-nums" style={{ color: lucroPositivo ? "var(--success)" : "var(--destructive)" }}>{moeda.format(campanha.lucro.lucroEstimado)}{campanha.lucro.custosIncompletos && "*"}</dd></div>
                </dl>
              </article>
            );
          })}
        </div>
        <div className="table-scroll hidden px-1 pb-5 pt-3 md:block sm:px-2">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] font-medium uppercase text-muted-foreground">
                {copy.colunas.map((coluna, indice) => (
                  <th key={coluna} className={`px-3 py-2 ${indice > 1 ? "text-right" : ""}`}>{coluna}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {campanhas.map((campanha, indice) => {
                const lucroPositivo = campanha.lucro.lucroEstimado >= 0;
                return (
                  <motion.tr
                    key={campanha.campanhaId}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ ...springs.settleFast, delay: indice * 0.03 }}
                    className={indice < campanhas.length - 1 ? "border-b border-border" : ""}
                  >
                    <td className="max-w-[220px] truncate px-3 py-2.5 font-medium text-foreground">{campanha.nome}</td>
                    <td className="px-3 py-2.5"><BadgeStatus status={campanha.status} /></td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                      {campanha.orcamento !== null ? moeda.format(campanha.orcamento) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium tabular-nums text-foreground">{moeda.format(campanha.investimento)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{moeda.format(campanha.receita)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold">
                      <Roas valor={campanha.roas} minimo={campanha.breakEven.roasMinimo} />
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums" style={{ color: lucroPositivo ? "var(--success)" : "var(--destructive)" }} title={campanha.lucro.custosIncompletos ? "Estimativa parcial — custo do produto não configurado" : undefined}>
                      {moeda.format(campanha.lucro.lucroEstimado)}{campanha.lucro.custosIncompletos && "*"}
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="px-4 pb-4 text-xs text-muted-foreground">* estimativa parcial — custo do produto ainda não configurado no catálogo.</p>
        </>
      )}
    </Card>
  );
}
