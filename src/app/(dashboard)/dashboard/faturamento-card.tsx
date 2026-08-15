"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingDown, TrendingUp } from "lucide-react";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { Skeleton } from "@/shared/design-system/primitives/Skeleton";
import { CalendarioPopover } from "@/shared/design-system/primitives/CalendarioPopover";
import { springs } from "@/shared/design-system/motion-variants";
import { getIcon } from "@/shared/config/icon-registry";
import dashboardConfig from "@/config/dashboard.json";
import { Card, CardHead, useContagem } from "./card-primitives";
import type { FaturamentoResumo } from "@/modules/metricas/application/dashboard.service";
import type { Periodo } from "./page";

const copy = dashboardConfig.cards.faturamento;

function paraDataInput(data: Date) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}
const hoje = paraDataInput(new Date());

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/* ── Seletor de período ───────────────────────────────────────
   Dois campos de calendário separados, "De:" e "Até:", cada um com seu
   próprio rótulo e contorno — não uma pílula com as duas datas juntas. */
function SeletorPeriodo({ periodo, onDatas, disabled }: {
  periodo: Periodo;
  onDatas: (inicio: string, fim: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <CalendarioPopover
        rotulo="De:"
        valor={periodo.inicio}
        max={periodo.fim || hoje}
        onChange={(inicio) => onDatas(inicio, periodo.fim)}
        disabled={disabled}
      />
      <CalendarioPopover
        rotulo="Até:"
        valor={periodo.fim}
        min={periodo.inicio}
        max={hoje}
        onChange={(fim) => onDatas(periodo.inicio, fim)}
        disabled={disabled}
        atraso={0.04}
      />
    </div>
  );
}

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

function EsqueletoFaturamento() {
  return (
    <div className="px-5 pb-5">
      <Skeleton className="mt-4 h-8 w-40" />
      <Skeleton className="mt-2 h-3.5 w-28" />
      <Skeleton className="mt-6 h-36 w-full" />
    </div>
  );
}

export function FaturamentoCard({ dados, periodo, onDatasPersonalizadas, carregando, semFiltro, scope }: {
  dados: FaturamentoResumo | null;
  periodo: Periodo;
  onDatasPersonalizadas: (inicio: string, fim: string) => void;
  carregando: boolean;
  semFiltro: boolean;
  scope?: React.ReactNode;
}) {
  const [focado, setFocado] = useState<number | null>(null);
  const Icon = getIcon(copy.icon);
  const valorAnimado = useContagem(dados?.totalNumerico ?? 0);
  const vazio = !dados || (dados.pedidos === 0 && dados.totalNumerico === 0);
  const variacao = dados?.variacaoPercentual ?? null;
  const positiva = (variacao ?? 0) >= 0;
  const pontoFocado = dados && focado !== null ? dados.serie[focado] : null;

  return (
    <Card>
      <CardHead
        title={copy.title}
        subtitle={dados?.janelaLabel}
        icon={Icon}
        accent={copy.accent}
        scope={scope}
        trailing={<SeletorPeriodo periodo={periodo} onDatas={onDatasPersonalizadas} disabled={carregando} />}
      />

      {/* Troca por crossfade, nunca desmontando o Card — evita o "piscar"
          ao mudar de filtro. Com conteúdo anterior na tela, uma busca em
          voo só esmaece um pouco em vez de sumir e reaparecer. */}
      <motion.div animate={{ opacity: carregando && dados ? 0.55 : 1 }} transition={springs.settleFast}>
        <AnimatePresence mode="wait" initial={false}>
          {semFiltro ? (
            <motion.div key="prompt" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={springs.settleFast}>
              <EmptyState
                illustration="revenue"
                title="Selecione um filtro"
                description="Escolha uma marca ou canal acima para ver o faturamento."
              />
            </motion.div>
          ) : carregando && !dados ? (
            <motion.div key="skeleton" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={springs.settleFast}>
              <EsqueletoFaturamento />
            </motion.div>
          ) : vazio ? (
            <motion.div key="vazio" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={springs.settleFast}>
              <EmptyState illustration="revenue" title={copy.emptyTitle} description={copy.emptyDescription} />
            </motion.div>
          ) : (
            <motion.div key="conteudo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={springs.settleFast} className="px-5 pb-5">
              <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-2">
                <p className="text-stat-lg text-foreground">{moeda.format(valorAnimado)}</p>
                {variacao !== null && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums"
                    style={{
                      background: positiva ? "rgba(31,138,76,.12)" : "rgba(194,24,32,.12)",
                      color: positiva ? "var(--success)" : "var(--destructive)",
                    }}
                  >
                    {positiva ? <TrendingUp size={12} strokeWidth={2.5} /> : <TrendingDown size={12} strokeWidth={2.5} />}
                    {positiva ? "+" : ""}{variacao}%
                  </span>
                )}
                {variacao !== null && (
                  <span className="text-xs text-muted-foreground">{copy.comparisonLabel}</span>
                )}
              </div>

              <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">
                {dados?.pedidos} {copy.ordersLabel} · {dados?.ticketMedio} {copy.ticketLabel}
              </p>

              <div className="mt-5">
                {/* Leitura do ponto sob o cursor. Fica em posição fixa em vez de
                    tooltip flutuante: nada é cortado pela borda do card nem empurra layout. */}
                <p className="mb-2 h-4 text-xs font-semibold tabular-nums text-muted-foreground">
                  {pontoFocado ? `${pontoFocado.label} · ${moeda.format(pontoFocado.valor)}` : ""}
                </p>
                {dados && <GraficoSerie serie={dados.serie} aoFocar={setFocado} />}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </Card>
  );
}
