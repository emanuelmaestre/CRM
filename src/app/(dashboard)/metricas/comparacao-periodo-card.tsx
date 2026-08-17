"use client";

import type { SaudeLojaResultado, SaudeMarca } from "@/modules/metricas/application/saude-loja.service";
import { Card, CardHead, NumeroAnimado } from "./metricas-primitives";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { CalculoPopover } from "@/shared/design-system/primitives/CalculoPopover";
import { BrandLogo } from "@/shared/design-system/primitives/BrandLogo";
import { isBrandSlug } from "@/shared/config/brands";
import { inteiro, moeda } from "@/shared/design-system/format";

function delta(atual: number, anterior: number) {
  return anterior === 0 ? null : Math.round(((atual - anterior) / Math.abs(anterior)) * 1000) / 10;
}

interface ItemComparacao {
  label: string;
  valor: number | null;
  atualLabel: string;
  anteriorLabel: string;
  formula: string;
}

function montarItens(marca: SaudeMarca, base: SaudeMarca | undefined): ItemComparacao[] {
  return [
    {
      label: "Faturamento",
      valor: delta(marca.faturamento, base?.faturamento ?? 0),
      atualLabel: marca.faturamentoLabel,
      anteriorLabel: base ? base.faturamentoLabel : moeda.format(0),
      formula: "quanto o faturamento do período atual variou em relação ao anterior, em porcentagem",
    },
    {
      label: "Pedidos",
      valor: delta(marca.pedidos, base?.pedidos ?? 0),
      atualLabel: inteiro.format(marca.pedidos),
      anteriorLabel: inteiro.format(base?.pedidos ?? 0),
      formula: "quanto a quantidade de pedidos variou do período anterior para o atual, em porcentagem",
    },
    {
      label: "Ticket médio",
      valor: delta(marca.ticketMedio, base?.ticketMedio ?? 0),
      atualLabel: marca.ticketMedioLabel,
      anteriorLabel: base ? base.ticketMedioLabel : moeda.format(0),
      formula: "quanto o ticket médio variou do período anterior para o atual, em porcentagem",
    },
    {
      label: "Cancelamento",
      valor: base?.taxaCancelamento == null || marca.taxaCancelamento == null
        ? null
        : Math.round((marca.taxaCancelamento - base.taxaCancelamento) * 10) / 10,
      atualLabel: marca.taxaCancelamento === null ? "—" : `${marca.taxaCancelamento}%`,
      anteriorLabel: base?.taxaCancelamento == null ? "—" : `${base.taxaCancelamento}%`,
      formula: "diferença entre a taxa de cancelamento atual e a anterior, em pontos percentuais",
    },
  ];
}

export function ComparacaoPeriodoCard({ atual, anterior }: { atual: SaudeLojaResultado; anterior: SaudeLojaResultado | null }) {
  const anteriorPorMarca = new Map((anterior?.marcas ?? []).map((marca) => [marca.brandId, marca]));
  return <Card>
    <CardHead />
    {atual.marcas.length === 0 ? (
      <EmptyState illustration="generic" title="Nenhuma marca ativa para comparar" description="Conecte um canal para a evolução entre períodos aparecer aqui." />
    ) : <div className="grid gap-3 p-4 md:grid-cols-3">{atual.marcas.map((marca) => {
      const base = anteriorPorMarca.get(marca.brandId);
      const itens = montarItens(marca, base);
      return <article key={marca.brandId} className="rounded-2xl border border-border p-4"><h3 className="flex h-5 items-center text-sm font-bold">{isBrandSlug(marca.marca) ? <BrandLogo brand={marca.marca} height={15} /> : marca.marcaLabel}</h3><dl className="mt-3 grid grid-cols-2 gap-3">{itens.map((item) => {
        const melhora = item.label === "Cancelamento" ? (item.valor ?? 0) <= 0 : (item.valor ?? 0) >= 0;
        return <div key={item.label}>
          <dt className="flex items-center gap-1 text-[10px] uppercase text-muted-foreground">
            <span>{item.label}</span>
            {item.valor !== null && (
              <CalculoPopover
                titulo={item.label}
                formula={item.formula}
                resultado={`${item.valor >= 0 ? "+" : ""}${item.valor}%`}
                periodoLabel={`${atual.periodoLabel} vs. ${anterior?.periodoLabel ?? "período anterior"}`}
                itens={[
                  { label: "Período atual", valor: item.atualLabel },
                  { label: "Período anterior", valor: item.anteriorLabel },
                ]}
              />
            )}
          </dt>
          <dd className={`text-sm font-bold ${item.valor === null ? "text-muted-foreground" : melhora ? "text-success" : "text-destructive"}`}>
            {item.valor === null ? "Sem base" : <NumeroAnimado valor={item.valor} formatar={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`} />}
          </dd>
        </div>;
      })}</dl></article>;
    })}</div>}
  </Card>;
}
