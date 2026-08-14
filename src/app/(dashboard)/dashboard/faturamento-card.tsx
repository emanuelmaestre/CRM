"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarRange, TrendingDown, TrendingUp } from "lucide-react";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { Skeleton } from "@/shared/design-system/primitives/Skeleton";
import { springs } from "@/shared/design-system/motion-variants";
import { getIcon } from "@/shared/config/icon-registry";
import dashboardConfig from "@/config/dashboard.json";
import { Card, CardHead, useContagem } from "./card-primitives";
import type { FaturamentoResumo } from "@/modules/relatorios/application/dashboard.service";
import type { Periodo } from "./page";

const copy = dashboardConfig.cards.faturamento;

function paraDataInput(data: Date) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}
const hoje = paraDataInput(new Date());

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const diaMesAno = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

/** Um botão só com o ícone de calendário — sem "dd/mm/aaaa" nem a data
 *  escrita ao lado. O valor escolhido vira o `title` (aparece no hover) e o
 *  `aria-label`, já que não tem mais texto visível pra mostrar pra ninguém.
 *  O input de verdade fica por cima, invisível e do tamanho do botão
 *  inteiro — é ele quem abre o calendário nativo ao clicar; a digitação
 *  continua desligada (só o calendário escolhe a data). */
function CampoData({ rotulo, valor, min, max, onChange, disabled, atraso = 0 }: {
  rotulo: string;
  valor: string;
  min?: string;
  max?: string;
  onChange: (valor: string) => void;
  disabled?: boolean;
  atraso?: number;
}) {
  const rotuloCompleto = valor ? `${rotulo} ${diaMesAno.format(new Date(`${valor}T00:00:00`))}` : rotulo;
  return (
    <motion.div
      initial={{ opacity: 0, y: -4, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...springs.settleFast, delay: atraso }}
      whileHover={disabled ? undefined : { scale: 1.06 }}
      whileTap={disabled ? undefined : { scale: 0.95 }}
      title={rotuloCompleto}
      className="group relative inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-[0.75rem] border border-border bg-muted shadow-[0_1px_2px_rgba(14,15,19,.04)] transition-all duration-200 hover:border-[rgba(155,48,217,.4)] hover:bg-card focus-within:border-[#9B30D9] focus-within:bg-card focus-within:shadow-[0_0_0_3px_rgba(155,48,217,.12)]"
    >
      <CalendarRange
        size={15}
        strokeWidth={2}
        aria-hidden="true"
        className="pointer-events-none shrink-0 text-muted-foreground transition-all duration-200 group-hover:scale-110 group-hover:text-[#9B30D9] group-focus-within:scale-110 group-focus-within:text-[#9B30D9]"
      />
      <input
        type="date"
        aria-label={rotuloCompleto}
        value={valor}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(evento) => onChange(evento.target.value)}
        onKeyDown={(evento) => evento.preventDefault()}
        onPaste={(evento) => evento.preventDefault()}
        className="absolute inset-0 h-full w-full cursor-pointer bg-transparent text-transparent outline-none ring-0 focus:outline-none disabled:opacity-50 [color-scheme:light] dark:[color-scheme:dark] invalid:outline-none invalid:shadow-none invalid:ring-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0"
      />
    </motion.div>
  );
}

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
      <CampoData
        rotulo="De:"
        valor={periodo.inicio}
        max={periodo.fim || hoje}
        onChange={(inicio) => onDatas(inicio, periodo.fim)}
        disabled={disabled}
      />
      <CampoData
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
                      color: positiva ? "#1F8A4C" : "#C21820",
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
