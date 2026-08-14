"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { TrendingDown, TrendingUp } from "lucide-react";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { springs } from "@/shared/design-system/motion-variants";
import { getIcon } from "@/shared/config/icon-registry";
import dashboardConfig from "@/config/dashboard.json";
import { Card, CardHead, Segmented, useContagem } from "./card-primitives";
import type { FaturamentoResumo, Granularidade } from "@/modules/relatorios/application/dashboard.service";

const copy = dashboardConfig.cards.faturamento;
const GRANULARIDADES = dashboardConfig.granularities as ReadonlyArray<{ value: Granularidade; label: string }>;

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/* ── Gráfico ───────────────────────────────────────────────────
   Barras em scaleY (propriedade de compositor, não força layout) com
   stagger curto. O pico ganha o gradiente da marca; o resto fica tonal,
   então o olho acha o topo sem precisar ler número. */
function GraficoSerie({ serie, aoFocar }: {
  serie: FaturamentoResumo["serie"];
  aoFocar: (indice: number | null) => void;
}) {
  const marcas = [0, Math.floor((serie.length - 1) / 2), serie.length - 1];
  const indicePico = serie.reduce(
    (melhor, ponto, indice) => (ponto.valor > (serie[melhor]?.valor ?? 0) ? indice : melhor),
    0,
  );

  return (
    <div>
      <div className="flex h-36 items-end gap-[3px]" onPointerLeave={() => aoFocar(null)}>
        {serie.map((ponto, indice) => {
          const pico = indice === indicePico && ponto.valor > 0;
          return (
            <div
              key={ponto.label + indice}
              className="flex h-full flex-1 items-end"
              onPointerEnter={() => aoFocar(indice)}
            >
              <motion.div
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ ...springs.settle, delay: Math.min(indice, 14) * 0.02 }}
                whileHover={{ opacity: 0.75 }}
                className="w-full rounded-t-[4px]"
                style={{
                  height: `${Math.max(ponto.altura, 2)}%`,
                  transformOrigin: "bottom",
                  background: pico ? "var(--gradient-signature)" : "var(--chart-bar)",
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[10px] font-semibold text-muted-foreground">
        {marcas.map((indice, posicao) => (
          <span key={posicao}>{serie[indice]?.label ?? ""}</span>
        ))}
      </div>
    </div>
  );
}

export function FaturamentoCard({ dados, granularidade, onGranularidade, carregando, scope }: {
  dados: FaturamentoResumo;
  granularidade: Granularidade;
  onGranularidade: (valor: Granularidade) => void;
  carregando: boolean;
  scope?: React.ReactNode;
}) {
  const [focado, setFocado] = useState<number | null>(null);
  const Icon = getIcon(copy.icon);
  const valorAnimado = useContagem(dados.totalNumerico);
  const vazio = dados.pedidos === 0 && dados.totalNumerico === 0;
  const variacao = dados.variacaoPercentual;
  const positiva = (variacao ?? 0) >= 0;
  const pontoFocado = focado === null ? null : dados.serie[focado];

  return (
    <Card>
      <CardHead
        title={copy.title}
        subtitle={dados.janelaLabel}
        icon={Icon}
        accent={copy.accent}
        trailing={
          <div className="flex items-center gap-2">
            {scope}
            <Segmented
              layoutId="dashboard-granularidade"
              value={granularidade}
              options={GRANULARIDADES}
              onChange={onGranularidade}
              disabled={carregando}
            />
          </div>
        }
      />

      {vazio ? (
        <EmptyState
          illustration="revenue"
          title={copy.emptyTitle}
          description={copy.emptyDescription}
        />
      ) : (
        <div className="px-5 pb-5">
          <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-2">
            <p className="text-stat-lg text-foreground">{moeda.format(valorAnimado)}</p>
            {variacao !== null && (
              <motion.span
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...springs.settleFast, delay: 0.15 }}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums"
                style={{
                  background: positiva ? "rgba(31,138,76,.12)" : "rgba(194,24,32,.12)",
                  color: positiva ? "#1F8A4C" : "#C21820",
                }}
              >
                {positiva ? <TrendingUp size={12} strokeWidth={2.5} /> : <TrendingDown size={12} strokeWidth={2.5} />}
                {positiva ? "+" : ""}{variacao}%
              </motion.span>
            )}
            {variacao !== null && (
              <span className="text-xs text-muted-foreground">{copy.comparisonLabel}</span>
            )}
          </div>

          <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">
            {dados.pedidos} {copy.ordersLabel} · {dados.ticketMedio} {copy.ticketLabel}
          </p>

          <div className="mt-5">
            {/* Leitura do ponto sob o cursor. Fica em posição fixa em vez de
                tooltip flutuante: nada é cortado pela borda do card nem empurra layout. */}
            <p className="mb-2 h-4 text-xs font-semibold tabular-nums text-muted-foreground">
              {pontoFocado ? `${pontoFocado.label} · ${moeda.format(pontoFocado.valor)}` : ""}
            </p>
            <GraficoSerie serie={dados.serie} aoFocar={setFocado} />
          </div>
        </div>
      )}
    </Card>
  );
}
