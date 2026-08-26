"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Check, ChevronDown, Minus, Receipt, ShoppingBag, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { Skeleton } from "@/shared/design-system/primitives/Skeleton";
import { CalculoPopover } from "@/shared/design-system/primitives/CalculoPopover";
import { AnimatedInfoPopover, AnimatedInfoTrigger } from "@/shared/design-system/primitives/AnimatedInfoPopover";
import { springs, fadeUp } from "@/shared/design-system/motion-variants";
import dashboardConfig from "@/config/dashboard.json";
import { Card, CardHead, useContagem } from "../metricas-primitives";
import { AcaoSlotFiltro } from "./listas-cards";
import { moeda } from "@/shared/design-system/format";
import type { FaturamentoResumo } from "@/modules/metricas/application/dashboard.service";
import { tint } from "@/shared/design-system/color";

const copy = dashboardConfig.cards.faturamento;

/** Sem marca escolhida ("todas"), o pico usa o gradiente genérico de sempre.
 *  Uma marca escolhida, cor pura dela. Mais de uma, um gradiente que passa
 *  pela cor de cada uma — a barra vira a prova visual de "isto é a soma
 *  dessas marcas" sem precisar ler legenda nenhuma. */
function corDoPico(cores: string[]): string {
  if (cores.length === 0) return "var(--gradient-signature)";
  if (cores.length === 1) return cores[0];
  return `linear-gradient(135deg, ${cores.join(", ")})`;
}

/* ── Gráfico ───────────────────────────────────────────────────
   Barras em scaleY (propriedade de compositor, não força layout) com
   stagger curto. O pico ganha o gradiente da marca; o resto fica tonal,
   então o olho acha o topo sem precisar ler número. */
function GraficoSerie({ serie, aoFocar, cores, altura = "h-36" }: {
  serie: FaturamentoResumo["serie"];
  aoFocar: (indice: number | null) => void;
  cores: string[];
  /** Classes de altura (com breakpoints se necessário) — permite encolher o
   *  gráfico em telas maiores pra caber o card inteiro sem rolagem. */
  altura?: string;
}) {
  // Com 1 dia só (período "Hoje"), a barra única — sempre o pico —
  // ocupava a largura inteira do gráfico com o gradiente de destaque,
  // parecendo um bloco quebrado/sem dado em vez de um gráfico de verdade.
  // Uma frase substitui a barra até existir pelo menos 2 dias pra comparar.
  if (serie.length <= 1) {
    return (
      <p className={`flex ${altura} items-center justify-center text-center text-xs text-muted-foreground`}>
        Escolha um período com mais de 1 dia para ver a evolução diária.
      </p>
    );
  }

  const marcas = [0, Math.floor((serie.length - 1) / 2), serie.length - 1];
  const indicePico = serie.reduce(
    (melhor, ponto, indice) => (ponto.valor > (serie[melhor]?.valor ?? 0) ? indice : melhor),
    0,
  );
  const gradientePico = corDoPico(cores);
  const pontoPico = serie[indicePico];

  return (
    <div>
      <div
        className={`flex ${altura} items-end gap-[3px]`}
        onPointerLeave={() => aoFocar(null)}
        role="img"
        aria-label={
          pontoPico
            ? `Gráfico de faturamento por dia, ${serie.length} pontos. Pico em ${pontoPico.label}: ${moeda.format(pontoPico.valor)}.`
            : "Gráfico de faturamento por dia, sem dado no período."
        }
      >
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
                  background: pico ? gradientePico : "var(--chart-bar)",
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

/* ── Entenda o faturamento ────────────────────────────────────────
   Mesmo padrão do "Entenda os status" (ver EntendaStatusBotao em
   listas-cards.tsx): popover animado, portado pro cabeçalho do Foco no
   desktop via AcaoSlotFiltro. Bruto e Líquido lado a lado, cada um com o
   que entra (check) e o que fica de fora (traço) — a mesma leitura usada
   pra explicar taxa/frete no popover de variação (CalculoPopover, mais
   abaixo), só que aqui o foco é o valor em si, não a variação dele. */
function ItemRegra({ tipo, children }: { tipo: "entra" | "fora"; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-[12.5px] leading-relaxed text-muted-foreground">
      <span
        className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
        style={
          tipo === "entra"
            ? { background: tint("var(--success)", 16), color: "var(--success)" }
            : { background: "var(--muted)", color: "var(--muted-foreground)" }
        }
      >
        {tipo === "entra" ? <Check size={11} strokeWidth={3} /> : <Minus size={11} strokeWidth={3} />}
      </span>
      <span>{children}</span>
    </li>
  );
}

function EntendaFaturamentoBotao() {
  return (
    <AnimatedInfoPopover
      trigger={(
        <AnimatedInfoTrigger
          title="Entenda como o faturamento é calculado"
          iconSize={13}
          className="press-feedback inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-full border border-border px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted"
        >
          <span className="sm:hidden">Faturamento</span>
          <span className="hidden sm:inline">Entenda o faturamento</span>
        </AnimatedInfoTrigger>
      )}
      align="end"
      sideOffset={8}
      collisionPadding={12}
      className="z-[100] w-[min(24rem,calc(100vw-1.5rem))] rounded-[1.1rem] border border-border bg-card p-5 shadow-[0_16px_40px_rgba(14,15,19,.24)] lg:w-[min(38rem,calc(100vw-1.5rem))]"
    >
      <p className="text-[11px] font-bold uppercase tracking-[.08em] text-muted-foreground">Como o faturamento é calculado</p>

      <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: tint("var(--selecionado)", 14), color: "var(--selecionado)" }}>
              <Wallet size={14} strokeWidth={2} />
            </span>
            <p className="text-sm font-bold text-foreground">Bruto</p>
          </div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
            É a soma do valor total de cada pedido concluído dentro do período escolhido, sem nenhum desconto aplicado.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            <ItemRegra tipo="entra">Valor completo do pedido: produto e frete cobrado do cliente</ItemRegra>
            <ItemRegra tipo="fora">Pedidos cancelados</ItemRegra>
            <ItemRegra tipo="fora">Pedidos devolvidos</ItemRegra>
          </ul>
        </div>

        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
              <Receipt size={14} strokeWidth={2} />
            </span>
            <p className="text-sm font-bold text-foreground">Líquido</p>
          </div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
            É o valor bruto depois de descontar o que sai do bolso do vendedor em cada venda.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            <ItemRegra tipo="entra">Desconta a taxa do marketplace por item, quando o canal informa esse valor</ItemRegra>
            <ItemRegra tipo="entra">Desconta o frete pago pelo vendedor</ItemRegra>
            <ItemRegra tipo="fora">Não desconta desconto ou acréscimo aplicado ao pedido</ItemRegra>
            <ItemRegra tipo="fora">Não desconta o custo do produto</ItemRegra>
          </ul>
        </div>
      </div>

      <p className="mt-4 rounded-[0.85rem] px-3 py-2.5 text-[12px] font-medium leading-relaxed" style={{ background: tint("var(--selecionado)", 8), color: "var(--foreground)" }}>
        Cancelamento e devolução nunca entram em nenhum dos dois valores, bruto ou líquido, em nenhuma hipótese.
      </p>
    </AnimatedInfoPopover>
  );
}

/** Bruto/Líquido: no mobile porta pra mesma linha do "Período" (acaoSlot no
 *  cabeçalho do painel, ver AcaoSlotFiltro) — antes ficava numa linha própria
 *  logo abaixo do filtro de canal, uma linha a mais só pra um toggle curto
 *  que cabe de sobra ao lado do período. No desktop segue no lugar de sempre,
 *  dentro do corpo do card. */
function TipoToggle({ liquido, aoTrocarLiquido }: { liquido: boolean; aoTrocarLiquido: (liquido: boolean) => void }) {
  return (
    <div role="tablist" aria-label="Tipo de faturamento" className="inline-flex rounded-full bg-muted p-0.5 text-xs font-semibold">
      {(["bruto", "liquido"] as const).map((opcao) => (
        <button
          key={opcao}
          type="button"
          role="tab"
          aria-selected={liquido === (opcao === "liquido")}
          onClick={() => aoTrocarLiquido(opcao === "liquido")}
          className="rounded-full px-3 py-1 transition-colors"
          style={
            liquido === (opcao === "liquido")
              ? { background: "var(--card)", color: "var(--foreground)", boxShadow: "var(--shadow-sm)" }
              : { color: "var(--muted-foreground)" }
          }
        >
          {opcao === "bruto" ? "Bruto" : "Líquido"}
        </button>
      ))}
    </div>
  );
}

/* ── Digitação da leitura guiada ──────────────────────────────────
   O bloco "leitura guiada" (logo abaixo do gráfico) entra digitando, não
   surgindo pronto — cada trecho do texto (`Chunk`) mantém sua formatação
   (negrito, cor) enquanto é revelado caractere a caractere. */
type Chunk = { text: string; bold?: boolean; color?: string };

function somarChunks(chunks: Chunk[]): number {
  return chunks.reduce((soma, c) => soma + c.text.length, 0);
}

function renderDigitado(chunks: Chunk[], visivel: number) {
  let restante = visivel;
  return chunks.map((chunk, indice) => {
    const parte = chunk.text.slice(0, Math.max(0, restante));
    restante -= chunk.text.length;
    if (!parte) return null;
    return chunk.bold ? (
      <strong key={indice} className="font-semibold text-foreground" style={chunk.color ? { color: chunk.color } : undefined}>
        {parte}
      </strong>
    ) : (
      <span key={indice} style={chunk.color ? { color: chunk.color } : undefined}>
        {parte}
      </span>
    );
  });
}

/** Cursor piscante mostrado ao fim do trecho sendo digitado no momento. */
function CursorDigitando() {
  return <span aria-hidden className="ml-0.5 inline-block h-3 w-[2px] -translate-y-[1px] animate-pulse bg-current align-middle" />;
}

/** Revela `total` caracteres progressivamente em ~55 passos, independente do
 *  tamanho do texto — textos curtos e longos "digitam" na mesma duração
 *  aproximada. Reinicia sempre que `resetKey` muda (troca de filtro/toggle).
 *  Pula direto pro texto completo quando `ativo` é falso (reduced motion). */
function useDigitacao(total: number, ativo: boolean, resetKey: string): number {
  const [visivel, setVisivel] = useState(ativo ? 0 : total);
  useEffect(() => {
    if (!ativo || total === 0) {
      setVisivel(total);
      return;
    }
    setVisivel(0);
    const passo = Math.max(1, Math.round(total / 55));
    let atual = 0;
    const id = setInterval(() => {
      atual += passo;
      setVisivel(Math.min(atual, total));
      if (atual >= total) clearInterval(id);
    }, 16);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, ativo, total]);
  return visivel;
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

export function FaturamentoCard({ dados, carregando, semFiltro, cores = [], scope, acaoSlot, liquido, aoTrocarLiquido }: {
  dados: FaturamentoResumo | null;
  carregando: boolean;
  semFiltro: boolean;
  /** Cor de cada marca ativa no filtro do card — vazio ("todas"), 1 ou várias. */
  cores?: string[];
  scope?: React.ReactNode;
  /** Nó do cabeçalho do Foco onde o filtro de marca/canal é portado no
   *  desktop — mesmo mecanismo do Estoque Parado/Repor em breve. */
  acaoSlot?: HTMLElement | null;
  /** Controlado pelo mosaico — o título do card no cabeçalho do Foco também
   *  muda entre "Faturamento bruto"/"Faturamento líquido" junto com o toggle. */
  liquido: boolean;
  aoTrocarLiquido: (liquido: boolean) => void;
}) {
  const reduzir = useReducedMotion();
  const [focado, setFocado] = useState<number | null>(null);
  const [obsAberto, setObsAberto] = useState(false);
  const valorAnimado = useContagem((liquido ? dados?.totalLiquidoNumerico : dados?.totalNumerico) ?? 0);
  const vazio = !dados || (dados.pedidos === 0 && dados.totalNumerico === 0);
  const variacao = (liquido ? dados?.variacaoPercentualLiquido : dados?.variacaoPercentual) ?? null;
  const positiva = (variacao ?? 0) >= 0;
  const serieAtiva = dados ? (liquido ? dados.serieLiquido : dados.serie) : [];
  const pontoFocado = focado !== null ? serieAtiva[focado] ?? null : null;

  /* Leitura guiada (bloco abaixo do gráfico): montada como texto+formatação
     (chunks) mesmo quando não há dado ainda, pra manter os hooks (useState/
     useEffect dentro de useDigitacao) sempre chamados na mesma ordem — só o
     JSX é condicional, não os hooks. */
  const temResumo = Boolean(dados) && variacao !== null;
  const corTendenciaResumo = positiva ? "var(--success)" : "var(--destructive)";
  const valorAtualResumo = liquido ? (dados?.totalLiquidoNumerico ?? 0) : (dados?.totalNumerico ?? 0);
  const valorAnteriorResumoNumerico = liquido ? (dados?.totalAnteriorLiquidoNumerico ?? 0) : (dados?.totalAnteriorNumerico ?? 0);
  const valorAnteriorResumoLabel = liquido ? (dados?.totalAnteriorLiquido ?? "") : (dados?.totalAnterior ?? "");
  const ticketResumoLabel = liquido ? (dados?.ticketMedioLiquido ?? "") : (dados?.ticketMedio ?? "");
  const diferencaResumo = Math.abs(valorAtualResumo - valorAnteriorResumoNumerico);

  const headlineChunks: Chunk[] = temResumo && dados ? [
    { text: `Faturamento ${liquido ? "líquido" : "bruto"} ${positiva ? "cresceu" : "caiu"} ` },
    { text: `${Math.abs(variacao ?? 0)}%`, bold: true, color: corTendenciaResumo },
    { text: ` em ${dados.janelaLabel}, na comparação com ${dados.janelaAnteriorLabel}.` },
  ] : [];

  const detailChunks: Chunk[] = temResumo && dados ? [
    { text: "Foi de " },
    { text: valorAnteriorResumoLabel, bold: true },
    { text: " para " },
    { text: moeda.format(valorAtualResumo), bold: true },
    { text: ` (${positiva ? "+" : "-"}${moeda.format(diferencaResumo)}), somando ` },
    { text: `${dados.pedidos} pedido${dados.pedidos === 1 ? "" : "s"}`, bold: true },
    { text: " no período, com ticket médio de " },
    { text: ticketResumoLabel, bold: true },
    { text: "." },
  ] : [];

  const obsChunks: Chunk[] = temResumo
    ? liquido
      ? [
        { text: "OBS: ", bold: true },
        { text: "faturamento " },
        { text: "líquido", bold: true },
        { text: " é o valor bruto do pedido menos a taxa do marketplace por item (quando o canal informa esse valor) e o frete pago por você como vendedor. Não desconta desconto ou acréscimo aplicado ao pedido, nem o custo do produto." },
      ]
      : [
        { text: "OBS: ", bold: true },
        { text: "faturamento " },
        { text: "bruto", bold: true },
        { text: " é a soma do valor total de cada pedido concluído no período, incluindo produto e frete cobrado do cliente, sem nenhum desconto aplicado. Pedidos cancelados e devolvidos nunca entram em nenhum dos dois valores." },
      ]
    : [];

  const totalHeadline = somarChunks(headlineChunks);
  const totalDetail = somarChunks(detailChunks);
  const totalObs = somarChunks(obsChunks);
  const resumoKey = `${dados?.janelaLabel ?? ""}-${liquido}`;
  const visivelResumo = useDigitacao(totalHeadline + totalDetail, !reduzir, resumoKey);
  const visivelHeadline = Math.max(0, Math.min(totalHeadline, visivelResumo));
  const visivelDetail = Math.max(0, Math.min(totalDetail, visivelResumo - totalHeadline));
  // OBS digita só quando expandida — mantém o card fechado por padrão sem
  // gastar altura com a explicação de cálculo, que é secundária.
  const visivelObs = useDigitacao(totalObs, obsAberto && !reduzir, `${resumoKey}-${obsAberto}`);

  return (
    <Card>
      <AcaoSlotFiltro scope={scope} acaoSlot={acaoSlot} extra={<EntendaFaturamentoBotao />} />
      {acaoSlot && createPortal(
        <div className="flex sm:hidden">
          <TipoToggle liquido={liquido} aoTrocarLiquido={aoTrocarLiquido} />
        </div>,
        acaoSlot,
      )}
      <CardHead scope={<div className="mt-3 flex w-full flex-wrap justify-center gap-2 sm:hidden">{scope}</div>} />

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
              <div className="mt-3 hidden justify-end sm:flex">
                <TipoToggle liquido={liquido} aoTrocarLiquido={aoTrocarLiquido} />
              </div>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-2">
                <p className="text-stat-lg text-foreground">{moeda.format(valorAnimado)}</p>
                {variacao !== null && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums"
                    style={{
                      background: positiva ? tint("var(--success)", 12) : tint("var(--destructive)", 12),
                      color: positiva ? "var(--success)" : "var(--destructive)",
                    }}
                  >
                    {positiva ? <TrendingUp size={12} strokeWidth={2.5} /> : <TrendingDown size={12} strokeWidth={2.5} />}
                    {positiva ? "+" : ""}{variacao}%
                  </span>
                )}
                {variacao !== null && dados && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title={`${copy.comparisonLabel}: ${dados.janelaAnteriorLabel}`}>
                    vs. {dados.janelaAnteriorLabel}
                    <CalculoPopover
                      titulo={`Variação de faturamento ${liquido ? "líquido" : "bruto"}`}
                      significado="Mostra se a receita cresceu ou caiu em comparação com uma janela anterior de mesma duração. Valor positivo representa crescimento; negativo, queda."
                      formula="quanto o faturamento do período atual variou em relação ao período anterior, em porcentagem"
                      resultado={`${positiva ? "+" : ""}${variacao}%`}
                      periodoLabel={`${dados.janelaLabel} em comparação com ${dados.janelaAnteriorLabel}`}
                      itens={[
                        { label: "Período atual", valor: liquido ? dados.totalLiquido : dados.total },
                        { label: "Período anterior", valor: liquido ? dados.totalAnteriorLiquido : dados.totalAnterior },
                      ]}
                      nota={
                        liquido
                          ? "Líquido descontando taxa de marketplace (por item, quando o canal informa) e frete pago pelo vendedor. Não desconta desconto/acréscimo nem custo do produto. O período anterior possui o mesmo número de dias do período atual e termina antes do início dele, sem sobreposição."
                          : "O período anterior possui o mesmo número de dias do período atual e termina antes do início dele, sem sobreposição."
                      }
                    />
                  </span>
                )}
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1.5">
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ShoppingBag size={13} strokeWidth={2} className="shrink-0 opacity-70" />
                  <span className="font-semibold tabular-nums text-foreground">{dados?.pedidos}</span> {copy.ordersLabel}
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Receipt size={13} strokeWidth={2} className="shrink-0 opacity-70" />
                  <span className="font-semibold tabular-nums text-foreground">{liquido ? dados?.ticketMedioLiquido : dados?.ticketMedio}</span> {copy.ticketLabel}
                </span>
              </div>

              <div className="mt-3 sm:mt-4">
                {/* Leitura do ponto sob o cursor. Fica em posição fixa em vez de
                    tooltip flutuante: nada é cortado pela borda do card nem empurra layout. */}
                <p className="mb-2 h-4 text-xs font-semibold tabular-nums text-muted-foreground">
                  {pontoFocado ? `${pontoFocado.label} · ${moeda.format(pontoFocado.valor)}` : ""}
                </p>
                {/* Gráfico mais baixo em telas maiores (sm+): no desktop/tablet
                    a soma dos blocos abaixo (leitura guiada) costumava empurrar
                    o card pra fora da viewport, forçando rolagem. No mobile
                    mantém a altura original — tela estreita já rola mesmo. */}
                {dados && <GraficoSerie serie={serieAtiva} aoFocar={setFocado} cores={cores} altura="h-36 sm:h-28" />}
              </div>

              {/* Leitura guiada da comparação acima — traduz os números do
                  cabeçalho (valor, variação, pedidos) numa manchete + detalhe
                  que entram "digitando" (ver `useDigitacao`). A base de cálculo
                  (OBS) fica recolhida por padrão atrás de "Como é calculado" —
                  é informação de apoio, não precisa ocupar espaço sempre; isso
                  também é o que mantém o card inteiro visível sem rolagem em
                  desktop/tablet na maioria dos casos. */}
              {temResumo && dados && (
                <motion.div
                  key={`${dados.janelaLabel}-${liquido}`}
                  variants={reduzir ? undefined : fadeUp}
                  initial={reduzir ? undefined : "hidden"}
                  animate={reduzir ? undefined : "show"}
                  className="mt-3 flex items-start gap-2.5 overflow-hidden rounded-[0.85rem] border border-border p-3 sm:mt-4 sm:gap-3 sm:p-4"
                  style={{ background: tint(corTendenciaResumo, 5) }}
                >
                  <motion.span
                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full sm:h-8 sm:w-8"
                    style={{ background: tint(corTendenciaResumo, 14), color: corTendenciaResumo }}
                    animate={reduzir ? undefined : { scale: [1, 1.12, 1] }}
                    transition={reduzir ? undefined : { duration: 1.6, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
                  >
                    <motion.span
                      initial={reduzir ? undefined : { y: positiva ? 3 : -3, opacity: 0 }}
                      animate={reduzir ? undefined : { y: 0, opacity: 1 }}
                      transition={reduzir ? undefined : { ...springs.settleFast, delay: 0.15 }}
                      className="flex"
                    >
                      {positiva ? <TrendingUp size={14} strokeWidth={2.4} /> : <TrendingDown size={14} strokeWidth={2.4} />}
                    </motion.span>
                  </motion.span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold leading-snug text-foreground sm:text-[13.5px]">
                      {renderDigitado(headlineChunks, visivelHeadline)}
                      {!reduzir && visivelHeadline > 0 && visivelHeadline < totalHeadline && <CursorDigitando />}
                    </p>
                    <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground sm:text-[12.5px]">
                      {renderDigitado(detailChunks, visivelDetail)}
                      {!reduzir && visivelDetail > 0 && visivelDetail < totalDetail && <CursorDigitando />}
                    </p>

                    {/* "Saiba mais": explica a base de cálculo (bruto/líquido)
                        só quando pedido — mantém o bloco enxuto por padrão e
                        troca de conteúdo junto com o toggle Bruto/Líquido. */}
                    <button
                      type="button"
                      onClick={() => setObsAberto((v) => !v)}
                      aria-expanded={obsAberto}
                      className="press-feedback mt-1.5 inline-flex items-center gap-1 text-[11.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Como esse valor é calculado
                      <motion.span
                        animate={{ rotate: obsAberto ? 180 : 0 }}
                        transition={reduzir ? { duration: 0 } : springs.settleFast}
                        className="flex"
                      >
                        <ChevronDown size={12} strokeWidth={2.4} />
                      </motion.span>
                    </button>
                    <AnimatePresence initial={false}>
                      {obsAberto && (
                        <motion.div
                          initial={reduzir ? undefined : { height: 0, opacity: 0 }}
                          animate={reduzir ? undefined : { height: "auto", opacity: 1 }}
                          exit={reduzir ? undefined : { height: 0, opacity: 0 }}
                          transition={reduzir ? { duration: 0 } : springs.settleFast}
                          className="overflow-hidden"
                        >
                          <p className="mt-1.5 border-t border-border/60 pt-1.5 text-[12px] leading-relaxed text-muted-foreground sm:text-[12.5px]">
                            {renderDigitado(obsChunks, visivelObs)}
                            {!reduzir && visivelObs > 0 && visivelObs < totalObs && <CursorDigitando />}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </Card>
  );
}
