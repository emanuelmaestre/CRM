"use client";

import { motion } from "framer-motion";
import { BarChart3 } from "lucide-react";
import type { CampanhaVisaoGeral } from "@/modules/anuncios/application/visao-geral.service";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { springs } from "@/shared/design-system/motion-variants";
import anunciosConfig from "@/config/anuncios.json";
import { Card, CardHead } from "./anuncios-primitives";
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
      <CardHead title={copy.titulo} subtitle={copy.subtitulo} icon={BarChart3} accent="var(--info)" />
      {campanhas.length === 0 ? (
        <EmptyState illustration="reports" title={copy.semDado} />
      ) : (
        <div className="overflow-x-auto px-1 pb-5 pt-3 sm:px-2">
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
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums" style={{ color: campanha.roas === null ? undefined : campanha.roas >= 1 ? "var(--success)" : "var(--destructive)" }}>
                      {campanha.roas === null ? "—" : `${campanha.roas.toFixed(2)}x`}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums" style={{ color: lucroPositivo ? "var(--success)" : "var(--destructive)" }} title={campanha.lucro.custosIncompletos ? "Estimativa parcial — custo do produto não configurado" : undefined}>
                      {moeda.format(campanha.lucro.lucroEstimado)}{campanha.lucro.custosIncompletos && "*"}
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 px-3 text-[10px] text-muted-foreground">* estimativa parcial — custo do produto ainda não configurado no catálogo.</p>
        </div>
      )}
    </Card>
  );
}
