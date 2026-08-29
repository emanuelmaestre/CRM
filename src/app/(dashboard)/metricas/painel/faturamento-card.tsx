"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { AlertTriangle, Check, ChevronRight, Clock, Minus, Receipt, ShoppingBag, TrendingDown, TrendingUp, Wallet } from "lucide-react";
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
import { copyLimite, JanelaLimiteDoDia, somarLimite, type LimiteDoDia } from "@/shared/components/limite-do-dia";

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
/** `atencao` existe porque a lista do Líquido tem um terceiro caso: não é
 *  "entra" nem "fica de fora", é "depende do canal informar". Pintar isso de
 *  cinza junto com as exclusões escondia justamente a parte que muda o
 *  significado do número. */
function ItemRegra({ tipo, children }: { tipo: "entra" | "fora" | "atencao"; children: React.ReactNode }) {
  const estilo =
    tipo === "entra" ? { background: tint("var(--success)", 16), color: "var(--success)" }
    : tipo === "atencao" ? { background: tint("var(--warning)", 18), color: "var(--warning)" }
    : { background: "var(--muted)", color: "var(--muted-foreground)" };
  return (
    <li className="flex items-start gap-2 text-[12.5px] leading-relaxed text-muted-foreground">
      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full" style={estilo}>
        {tipo === "entra" ? <Check size={11} strokeWidth={3} />
          : tipo === "atencao" ? <AlertTriangle size={10} strokeWidth={3} />
          : <Minus size={11} strokeWidth={3} />}
      </span>
      <span>{children}</span>
    </li>
  );
}

/** `compacto` é a versão de mobile: só a bolinha do ⓘ, sem texto nenhum.
 *  O botão com rótulo não cabia na largura do celular junto do toggle
 *  Bruto/Líquido — ali ele vira um ícone redondo à esquerda do toggle. */
function EntendaFaturamentoBotao({ compacto = false }: { compacto?: boolean }) {
  return (
    <AnimatedInfoPopover
      trigger={(
        <AnimatedInfoTrigger
          title="Entenda como o faturamento é calculado"
          aria-label="Entenda como o faturamento é calculado"
          iconSize={compacto ? 15 : 13}
          className={
            compacto
              ? "press-feedback inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              : "press-feedback inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-full border border-border px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted"
          }
        >
          {!compacto && <span>Entenda o faturamento</span>}
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
            É o que <strong className="font-bold text-foreground">sobra da venda para você</strong> depois que o
            canal cobra o que é dele. Vem de duas origens diferentes, e a diferença importa:
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            <ItemRegra tipo="entra">
              <strong className="font-semibold text-foreground">Quando o canal informa o repasse</strong> (Shopee),
              é o número dele, não uma conta nossa: já vem com comissão, taxa de transação, tarifa de campanha e
              ajustes que só o canal conhece.
            </ItemRegra>
            <ItemRegra tipo="atencao">
              <strong className="font-semibold text-foreground">Quando o canal não informa</strong> (Mercado Livre),
              o valor é estimado: bruto menos as taxas que conhecemos por item, menos o frete. Como nem toda tarifa
              aparece, a estimativa tende a ficar <strong className="font-semibold text-foreground">acima</strong> do
              que cai de fato na conta.
            </ItemRegra>
            <ItemRegra tipo="fora">Não desconta desconto ou acréscimo aplicado ao pedido</ItemRegra>
            <ItemRegra tipo="fora">Não desconta o custo do produto — por isso líquido não é lucro</ItemRegra>
          </ul>
        </div>
      </div>

      <p className="mt-4 rounded-[0.85rem] px-3 py-2.5 text-[12px] font-medium leading-relaxed" style={{ background: tint("var(--selecionado)", 8), color: "var(--foreground)" }}>
        Cancelamento e devolução nunca entram em nenhum dos dois valores, bruto ou líquido, em nenhuma hipótese.
      </p>

      {/* A frase que fecha o entendimento: bruto responde "quanto vendi",
          líquido responde "quanto sobrou". Sem isso, as duas listas explicam o
          cálculo sem dizer para que serve cada número. */}
      <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
        Em resumo: o <strong className="font-semibold text-foreground">bruto</strong> responde quanto você vendeu; o{" "}
        <strong className="font-semibold text-foreground">líquido</strong>, quanto sobrou depois do canal. O que sobra
        do seu bolso — custo do produto, embalagem, imposto — não entra em nenhum dos dois.
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
  const chave = `${resetKey}:${ativo ? "animado" : "imediato"}:${total}`;
  const [progresso, setProgresso] = useState(() => ({ chave, visivel: ativo ? 0 : total }));
  const visivel = progresso.chave === chave
    ? progresso.visivel
    : ativo
      ? 0
      : total;

  useEffect(() => {
    if (!ativo || total === 0) return;

    const passo = Math.max(1, Math.round(total / 55));
    let atual = 0;
    const id = setInterval(() => {
      atual += passo;
      setProgresso({ chave, visivel: Math.min(atual, total) });
      if (atual >= total) clearInterval(id);
    }, 16);
    return () => clearInterval(id);
  }, [chave, ativo, total]);

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

/* ── Ressalva de fuso ─────────────────────────────────────────────────────
   A mesma hora de desencontro entre o calendário do Mercado Livre e o daqui
   que Vendas já explica, medida em dinheiro: quanto deste total o ML conta em
   outro dia. Mostra as duas medidas — quantos pedidos e quanto valor —, porque
   aqui a pergunta que se faz olhando o número grande é "quanto falta para
   bater", e a contagem sozinha não responde isso.

   Isto já foi uma faixa de largura inteira em linha própria. A forma era
   desproporcional ao peso do assunto: o conteúdo mede uns 370px e a faixa
   esticava por toda a largura do card — num monitor, quase mil pixels de azul
   vazio para anunciar dezenas de reais dentro de um total de milhares. Pior,
   o pulso que chama atenção cobria `inset-0`: era meia tela piscando de quatro
   em quatro segundos.

   Agora é um item da linha de "pedidos" e "valor médio", que é o lugar certo
   pela leitura — os três qualificam o número grande logo acima. O que o separa
   dos outros dois não é mais o tamanho, é a cor e a moldura: ele é o único
   clicável, e o único que fala de uma ressalva em vez de um componente da
   conta. O pulso desceu para o ícone, onde chama a mesma atenção sem acender
   um retângulo.

   Some inteira quando não há pedido na virada, quando o recorte de canal exclui
   o Mercado Livre ou quando não há período escolhido (a action devolve listas
   vazias nos três casos). */
function ChipFusoFaturamento({ dados, onClick }: { dados?: LimiteDoDia | null; onClick: () => void }) {
  const reduzir = useReducedMotion();
  if (!dados) return null;
  const { soNoMercadoLivre, soAqui } = dados;
  const quantidade = soNoMercadoLivre.length + soAqui.length;
  if (quantidade === 0) return null;

  // Mesma soma da janela e do card de Vendas — cancelado e devolvido fora,
  // porque o faturamento acima também os exclui e é com ele que se compara.
  const diferenca = Math.abs(somarLimite(soNoMercadoLivre) - somarLimite(soAqui));

  return (
    <motion.button
      type="button"
      onClick={onClick}
      title={copyLimite.faixaDica}
      whileHover={reduzir ? undefined : { y: -1 }}
      whileTap={reduzir ? undefined : { scale: 0.99 }}
      transition={springs.momentum}
      // `max-w-full` com `min-w-0` dentro: a linha que hospeda o chip tem
      // `flex-wrap`, então em tela estreita ele desce inteiro para a linha
      // seguinte em vez de espremer os outros dois itens. A altura mínima
      // existe só no celular, onde ele é um alvo de toque de verdade — no
      // desktop ela só engordaria a linha.
      className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border py-1 pl-2 pr-1.5 text-left sm:min-h-0"
      style={{
        borderColor: "color-mix(in srgb, var(--info) 30%, transparent)",
        background: "color-mix(in srgb, var(--info) 6%, transparent)",
      }}
    >
      {/* Mesmo tique de relógio das outras duas portas de entrada (ver
          SeloLimiteDoDia), agora contido no ícone: um halo de 20px em vez do
          fundo inteiro do card. */}
      <span className="relative inline-flex shrink-0 items-center justify-center">
        {!reduzir && (
          <motion.span
            aria-hidden="true"
            className="pointer-events-none absolute -inset-1 rounded-full"
            style={{ background: "color-mix(in srgb, var(--info) 22%, transparent)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 1, 0] }}
            transition={{ duration: 2.4, times: [0, 0.35, 0.7, 1], repeat: Infinity, repeatDelay: 4.4, ease: "easeInOut" }}
          />
        )}
        <Clock size={13} strokeWidth={2} className="relative" style={{ color: "var(--info)" }} />
      </span>
      <span className="min-w-0 truncate text-xs" style={{ color: "var(--info)" }}>
        <span className="font-bold tabular-nums">
          {(quantidade === 1 ? copyLimite.badgeContadorUm : copyLimite.badgeContadorMuitos).replace("{n}", String(quantidade))}
        </span>
        {" · "}
        <span className="font-bold tabular-nums">{moeda.format(diferenca)}</span>
        <span className="opacity-80"> {copyLimite.faixaSufixo}</span>
      </span>
      <ChevronRight size={13} className="shrink-0" style={{ color: "var(--info)" }} />
    </motion.button>
  );
}

export function FaturamentoCard({ dados, carregando, semFiltro, cores = [], scope, acaoSlot, liquido, aoTrocarLiquido, limiteDoDia }: {
  dados: FaturamentoResumo | null;
  carregando: boolean;
  semFiltro: boolean;
  /** Pedidos na fronteira de dia do Mercado Livre, no mesmo recorte do card. */
  limiteDoDia?: LimiteDoDia | null;
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
  /* Guarda PARA QUAL conjunto de pedidos a janela foi aberta, em vez de um
     booleano solto. Trocar o período ou o filtro troca os pedidos da
     fronteira: com um booleano, a janela seguiria aberta exibindo uma lista
     que ninguém pediu, e voltaria a aparecer sozinha assim que um recorte
     seguinte tivesse pedidos na virada. Comparando a identidade do dado, ela
     se fecha por dedução — sem efeito e sem estado a sincronizar. */
  const [limiteAbertoPara, setLimiteAbertoPara] = useState<LimiteDoDia | null>(null);
  const limiteAberto = limiteAbertoPara !== null && limiteAbertoPara === limiteDoDia;
  const setLimiteAberto = (abrir: boolean) => setLimiteAbertoPara(abrir ? limiteDoDia ?? null : null);
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

  /* Manchete curta: só o que aconteceu e de quanto. O período comparado
     saiu daqui pra uma linha própria (era o que fazia a frase virar um
     parágrafo de duas linhas), e os valores viraram a grade abaixo. */
  const headlineChunks: Chunk[] = temResumo && dados ? [
    { text: `Faturamento ${liquido ? "líquido" : "bruto"} ${positiva ? "cresceu" : "caiu"} ` },
    { text: `${Math.abs(variacao ?? 0)}%`, bold: true, color: corTendenciaResumo },
  ] : [];

  /* Fecha o raciocínio da manchete em uma frase — os números crus ficam na
     grade, aqui vai só a leitura ("é o resultado de N pedidos"). */
  const detailChunks: Chunk[] = temResumo && dados ? [
    { text: "Resultado de " },
    { text: `${dados.pedidos} pedido${dados.pedidos === 1 ? "" : "s"}`, bold: true },
    { text: " no período, com valor médio por pedido de " },
    { text: ticketResumoLabel, bold: true },
    { text: "." },
  ] : [];

  const obsChunks: Chunk[] = temResumo
    ? liquido
      ? [
        { text: "OBS: ", bold: true },
        { text: "faturamento " },
        { text: "líquido", bold: true },
        { text: " é o valor bruto do pedido menos a taxa do canal de venda por item (quando o canal informa esse valor) e o frete pago por você como vendedor. Não desconta desconto ou acréscimo aplicado ao pedido, nem o custo do produto." },
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
  const visivelResumo = useDigitacao(totalHeadline + totalDetail + totalObs, !reduzir, resumoKey);
  const visivelHeadline = Math.max(0, Math.min(totalHeadline, visivelResumo));
  const visivelDetail = Math.max(0, Math.min(totalDetail, visivelResumo - totalHeadline));
  const visivelObs = Math.max(0, Math.min(totalObs, visivelResumo - totalHeadline - totalDetail));

  return (
    <Card>
      <AcaoSlotFiltro scope={scope} acaoSlot={acaoSlot} extra={<EntendaFaturamentoBotao />} />
      {/* Mobile: ⓘ como bolinha à esquerda do toggle Bruto/Líquido, na mesma
          linha. O botão com rótulo ("Entenda o faturamento") só existe de
          `sm` pra cima, via `extra` do AcaoSlotFiltro acima. */}
      {acaoSlot && createPortal(
        <div className="flex items-center gap-2 sm:hidden">
          <EntendaFaturamentoBotao compacto />
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
              <div className="mt-2 hidden justify-end sm:flex">
                <TipoToggle liquido={liquido} aoTrocarLiquido={aoTrocarLiquido} />
              </div>
              <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-2">
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
                          ? "Líquido descontando a taxa do canal de venda (por item, quando o canal informa) e o frete pago pelo vendedor. Não desconta desconto/acréscimo nem custo do produto. O período anterior possui o mesmo número de dias do período atual e termina antes do início dele, sem sobreposição."
                          : "O período anterior possui o mesmo número de dias do período atual e termina antes do início dele, sem sobreposição."
                      }
                    />
                  </span>
                )}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5">
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ShoppingBag size={13} strokeWidth={2} className="shrink-0 opacity-70" />
                  <span className="font-semibold tabular-nums text-foreground">{dados?.pedidos}</span> {copy.ordersLabel}
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Receipt size={13} strokeWidth={2} className="shrink-0 opacity-70" />
                  <span className="font-semibold tabular-nums text-foreground">{liquido ? dados?.ticketMedioLiquido : dados?.ticketMedio}</span> {copy.ticketLabel}
                </span>

                {/* Terceiro item da mesma linha: o desencontro de fuso que
                    Vendas explica, medido em dinheiro. Vem depois de "pedidos"
                    e "valor médio" porque é da mesma natureza — os três
                    qualificam o número grande acima. `gap-x-5` já separa os
                    itens; a moldura e a cor é que dizem que só este é clicável. */}
                <ChipFusoFaturamento dados={limiteDoDia} onClick={() => setLimiteAberto(true)} />
              </div>

              <div className="mt-2.5 sm:mt-3">
                {/* Leitura do ponto sob o cursor. Fica em posição fixa em vez de
                    tooltip flutuante: nada é cortado pela borda do card nem empurra layout. */}
                <p className="mb-2 h-4 text-xs font-semibold tabular-nums text-muted-foreground">
                  {pontoFocado ? `${pontoFocado.label} · ${moeda.format(pontoFocado.valor)}` : ""}
                </p>
                {/* Gráfico mais baixo em telas maiores (sm+): no desktop/tablet
                    a soma dos blocos abaixo (leitura guiada) costumava empurrar
                    o card pra fora da viewport, forçando rolagem. No mobile
                    mantém a altura original — tela estreita já rola mesmo. */}
                {dados && <GraficoSerie serie={serieAtiva} aoFocar={setFocado} cores={cores} altura="h-32 sm:h-24" />}
              </div>

              {/* Leitura guiada da comparação acima — traduz os números do
                  cabeçalho (valor, variação, pedidos) numa manchete + detalhe
                  + base de cálculo (OBS), todos sempre visíveis e entrando
                  "digitando" em sequência (ver `useDigitacao`). Espaçamentos
                  enxutos no card inteiro (acima e dentro deste bloco) pra
                  caber sem rolagem em desktop/tablet na maioria dos casos. */}
              {temResumo && dados && (
                <motion.div
                  key={`${dados.janelaLabel}-${liquido}`}
                  variants={reduzir ? undefined : fadeUp}
                  initial={reduzir ? undefined : "hidden"}
                  animate={reduzir ? undefined : "show"}
                  className="mt-2.5 flex items-start gap-2.5 overflow-hidden rounded-[0.85rem] border border-border p-2.5 sm:mt-3 sm:gap-3 sm:p-3.5"
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
                    {/* Os dois períodos comparados, fora da manchete: viram
                        um par "de → para" que se lê de relance, em vez de uma
                        frase longa cheia de data no meio. */}
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
                      <span>{dados.janelaLabel}</span>
                      <span className="text-muted-foreground/60">vs.</span>
                      <span>{dados.janelaAnteriorLabel}</span>
                    </p>

                    {/* Grade dos 3 números que sustentam a manchete. Fora do
                        texto corrido de propósito: alinhados em coluna, o
                        olho compara "antes x agora" sem reler a frase. */}
                    <dl className="mt-2 grid grid-cols-3 gap-px overflow-hidden rounded-[0.6rem] border border-border/70 bg-border/70">
                      {[
                        { rotulo: "Antes", valor: valorAnteriorResumoLabel, cor: undefined },
                        { rotulo: "Agora", valor: moeda.format(valorAtualResumo), cor: undefined },
                        { rotulo: "Diferença", valor: `${positiva ? "+" : "-"}${moeda.format(diferencaResumo)}`, cor: corTendenciaResumo },
                      ].map((item, indice) => (
                        <motion.div
                          key={item.rotulo}
                          initial={reduzir ? undefined : { opacity: 0, y: 4 }}
                          animate={reduzir ? undefined : { opacity: 1, y: 0 }}
                          transition={reduzir ? undefined : { ...springs.settleFast, delay: 0.12 + indice * 0.07 }}
                          className="bg-card px-2 py-1.5"
                        >
                          <dt className="text-[9.5px] font-bold uppercase tracking-wide text-muted-foreground">{item.rotulo}</dt>
                          <dd
                            className="mt-0.5 truncate text-[12px] font-bold tabular-nums sm:text-[12.5px]"
                            style={{ color: item.cor ?? "var(--foreground)" }}
                          >
                            {item.valor}
                          </dd>
                        </motion.div>
                      ))}
                    </dl>

                    <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground sm:text-[12.5px]">
                      {renderDigitado(detailChunks, visivelDetail)}
                      {!reduzir && visivelDetail > 0 && visivelDetail < totalDetail && <CursorDigitando />}
                    </p>

                    {/* Base de cálculo (bruto/líquido) sempre visível — troca de
                        texto junto com o toggle Bruto/Líquido, sem exigir clique
                        pra ler o que compõe o valor exibido acima. */}
                    <p className="mt-1.5 border-t border-border/60 pt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
                      {renderDigitado(obsChunks, visivelObs)}
                      {!reduzir && visivelObs > 0 && visivelObs < totalObs && <CursorDigitando />}
                    </p>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* A janela mora fora do corpo do card — é um Dialog em tela cheia, via
          portal; a faixa acima é só a porta. É a MESMA explicação que o selo
          de Vendas abre, importada do compartilhado em vez de recriada. */}
      {limiteDoDia && (
        <JanelaLimiteDoDia dados={limiteDoDia} aberto={limiteAberto} setAberto={setLimiteAberto} />
      )}
    </Card>
  );
}
