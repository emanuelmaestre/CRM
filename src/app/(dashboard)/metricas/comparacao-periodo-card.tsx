"use client";

import { TrendingUp } from "lucide-react";
import type { SaudeLojaResultado } from "@/modules/metricas/application/saude-loja.service";
import { Card, CardHead } from "./metricas-primitives";

function delta(atual: number, anterior: number) {
  return anterior === 0 ? null : Math.round(((atual - anterior) / Math.abs(anterior)) * 1000) / 10;
}

export function ComparacaoPeriodoCard({ atual, anterior }: { atual: SaudeLojaResultado; anterior: SaudeLojaResultado | null }) {
  const anteriorPorMarca = new Map((anterior?.marcas ?? []).map((marca) => [marca.brandId, marca]));
  return <Card>
    <CardHead title="Período atual × anterior" subtitle="Mesma duração, imediatamente anterior ao intervalo selecionado" icon={TrendingUp} accent="var(--info)" />
    <div className="grid gap-3 p-4 md:grid-cols-3">{atual.marcas.map((marca) => {
      const base = anteriorPorMarca.get(marca.brandId);
      const itens = [
        ["Faturamento", delta(marca.faturamento, base?.faturamento ?? 0)],
        ["Pedidos", delta(marca.pedidos, base?.pedidos ?? 0)],
        ["Ticket médio", delta(marca.ticketMedio, base?.ticketMedio ?? 0)],
        ["Cancelamento", base?.taxaCancelamento == null || marca.taxaCancelamento == null ? null : Math.round((marca.taxaCancelamento - base.taxaCancelamento) * 10) / 10],
      ] as const;
      return <article key={marca.brandId} className="rounded-2xl border border-border p-4"><h3 className="text-sm font-bold">{marca.marcaLabel}</h3><dl className="mt-3 grid grid-cols-2 gap-3">{itens.map(([label, valor]) => {
        const melhora = label === "Cancelamento" ? (valor ?? 0) <= 0 : (valor ?? 0) >= 0;
        return <div key={label}><dt className="text-[10px] uppercase text-muted-foreground">{label}</dt><dd className={`text-sm font-bold ${valor === null ? "text-muted-foreground" : melhora ? "text-success" : "text-destructive"}`}>{valor === null ? "Sem base" : `${valor >= 0 ? "+" : ""}${valor}%`}</dd></div>;
      })}</dl></article>;
    })}</div>
  </Card>;
}
