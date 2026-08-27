"use client";

import { useState, useCallback, useEffect, useMemo, useRef, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  AlertTriangle, Check, Eye, Hourglass, Loader2, PackageX, PlugZap2,
  Search,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  actionListarProdutos, actionListarProdutosParados,
  actionIndicadoresEstoque, actionDefinirEstoqueMinimoEmLote,
  actionObterFiltrosEstoque,
} from "./actions";
import { SkeletonRow } from "@/shared/design-system/primitives/Skeleton";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { ChannelLogo, channelAccent } from "@/shared/design-system/primitives/ChannelLogo";
import { BrandLogo } from "@/shared/design-system/primitives/BrandLogo";
import { CoachMarks, type CoachMarkStep } from "@/shared/design-system/primitives/CoachMarks";
import { SelectPopover } from "@/shared/design-system/primitives/SelectPopover";
import { TintedStatCard } from "@/shared/design-system/primitives/TintedStatCard";
import { springs, variantes, staggerExagerado, entradaExagerada } from "@/shared/design-system/motion-variants";
import { NumeroAnimado } from "@/shared/design-system/primitives/NumeroAnimado";
import pagesConfig from "@/config/pages.json";
import channelsConfig from "@/config/channels.json";
import {
  ajustarMarcasSelecionadasAosCanais,
  getBrandConfig,
  isBrandSlug,
  marcaDisponivelNosCanais,
} from "@/shared/config/brands";
import { useAtualizacaoLocal } from "@/shared/lib/atualizacao-local";

type SaldoCanal = { canal: string; saldo: number; verificadoEm: string };

type Produto = {
  id: string; sku: string; nome: string; preco: string;
  estoqueMinimo: number; brandId: string; brandName: string; brandSlug: string; saldo?: number;
  saldosCanais?: SaldoCanal[];
  canais?: string[];
};

type Filtro = "todos" | "abaixo_minimo" | "sem_estoque" | "parados" | "sem_minimo";
type CanalVenda = "mercadolivre" | "shopee" | "tiktokshop";

type Indicadores = Awaited<ReturnType<typeof actionIndicadoresEstoque>>;
type ProdutoParado = Awaited<ReturnType<typeof actionListarProdutosParados>>[number];

const copy = pagesConfig.estoque;
const PAGINA = 50;

// "neutro" era var(--armarinhos-lima) — cor de marca reaproveitada por
// coincidência para o alerta "Parados", sem relação nenhuma com o motivo.
// var(--info) é neutra de verdade e já significa "informativo, não urgente"
// em outros pontos do app.
const COR = { critico: "var(--destructive)", atencao: "var(--warning)", ok: "var(--success)", info: "var(--info)", neutro: "var(--info)" };

const dinheiro = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function brandColor(slug: string) {
  return getBrandConfig(slug)?.color ?? "var(--muted-foreground)";
}

const TOUR: CoachMarkStep[] = [
  { target: "[data-tour=estoque-empresa]", ...copy.coach.steps[0] },
  { target: "[data-tour=estoque-minimo]", ...copy.coach.steps[1] },
];

/* ── Estado de uma linha ───────────────────────────────────────
   Ordem de urgência, não de igualdade: saldo zerado importa mais que régua
   ausente, e régua ausente importa mais que "está acima do mínimo". É a mesma
   precedência que a faixa de saúde usa no topo, para a tela não contar duas
   histórias sobre o mesmo produto. */
type EstadoLinha = "sem_estoque" | "sem_regua" | "abaixo" | "ok";

function estadoLinha(saldo: number, minimo: number): EstadoLinha {
  if (saldo <= 0) return "sem_estoque";
  if (minimo <= 0) return "sem_regua";
  if (saldo <= minimo) return "abaixo";
  return "ok";
}

const CORES_ESTADO: Record<EstadoLinha, string | null> = {
  sem_estoque: COR.atencao,
  abaixo: COR.critico,
  ok: COR.ok,
  sem_regua: null, // tracejado: não é um estado do saldo, é falta de configuração
};

/* ── Indicador em card ─────────────────────────────────────────
   Sempre existem os 3 — sumir com a categoria zerada foi o que gerou a
   dúvida "cadê o card de abaixo do mínimo?" quando só sobrava um dos três
   com valor. Em vez de esconder, o card com valor 0 se apaga pra cor neutra:
   continua nomeando a categoria, sem competir visualmente com quem realmente
   precisa de atenção. */
function AlertCard({ label, labelCurto, valor, sub, icon, tom, ativo, onClick }: {
  label: string;
  labelCurto?: string;
  valor: number;
  sub?: ReactNode;
  icon: LucideIcon;
  tom: "danger" | "warning" | "neutro";
  ativo: boolean;
  onClick: () => void;
}) {
  const cor = valor === 0
    ? "var(--muted-foreground)"
    : tom === "danger" ? COR.critico : tom === "warning" ? COR.atencao : COR.neutro;

  return (
    <TintedStatCard
      label={labelCurto ? <><span className="sm:hidden">{labelCurto}</span><span className="hidden sm:inline">{label}</span></> : label}
      // Rótulos curtos o bastante pra caber numa linha só nos 3 — não
      // precisa mais reservar altura pra uma possível 2ª linha (isso só
      // deixava os cards com sobra de espaço vazio acima do número).
      valor={<NumeroAnimado valor={valor} className="text-[26px] leading-none tracking-[-0.02em] sm:text-[30px]" />}
      icon={icon}
      cor={cor}
      sub={sub}
      ativo={ativo}
      onClick={onClick}
    />
  );
}

/* ── Faixa de saúde ────────────────────────────────────────────
   Adaptativa de propósito: o espaço segue o problema. Com alerta ativo, os
   indicadores que têm valor viram cards; sem alerta, a faixa inteira colapsa
   numa linha e devolve a altura para a lista de produtos — que é o trabalho
   real da tela. Enquanto não sabemos os números, não afirmamos nada: mostrar
   "0" enquanto carrega é dizer "tudo em ordem" antes de conferir. */
function FaixaSaude({ indicadores, erro, filtro, onFiltro }: {
  indicadores: Indicadores | null;
  erro: boolean;
  filtro: Filtro;
  onFiltro: (proximo: Filtro) => void;
}) {
  const hc = copy.health;

  // Falha em buscar o resumo (sem_minimo/abaixo_minimo/sem_estoque/parados)
  // não trava a tela — a lista de produtos abaixo é o que importa de
  // verdade, e ela já carrega independente disso. Sem card de erro aqui.
  if (erro) return null;

  if (!indicadores) {
    return (
      <div
        data-tour="estoque-saude"
        className="mb-4 flex items-center gap-3 rounded-[1.25rem] bg-card px-5 py-4 shadow-[0_2px_16px_rgba(14,15,19,.07)]"
      >
        <Loader2 size={16} className="animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">{hc.loading}</span>
      </div>
    );
  }

  const cardsTodos = [
    {
      id: "abaixo_minimo" as Filtro,
      label: copy.indicators.belowMin,
      labelCurto: "Abaixo mín.",
      valor: indicadores.abaixoMinimo,
      icon: AlertTriangle,
      tom: "danger" as const,
      sub: undefined as string | undefined,
    },
    {
      id: "sem_estoque" as Filtro,
      label: copy.indicators.outOfStock,
      labelCurto: "Zerados",
      valor: indicadores.semEstoque,
      icon: PackageX,
      tom: "warning" as const,
      sub: undefined as string | undefined,
    },
    {
      id: "parados" as Filtro,
      label: copy.indicators.stalled,
      labelCurto: "Parados",
      valor: indicadores.parados,
      icon: Hourglass,
      tom: "neutro" as const,
      sub: indicadores.capitalParado > 0
        ? <span className="hidden sm:inline">{dinheiro.format(indicadores.capitalParado)} {copy.indicators.capitalPrefix}</span>
        : undefined,
    },
  ];

  const semRegua = indicadores.semMinimo;
  const monitorados = Math.max(indicadores.total - semRegua, 0);
  // Catálogo redondo de verdade — nada em nenhuma das 3 categorias e nada
  // sem régua: aí sim vale trocar os cards por uma linha só de "tudo certo".
  const tudoZerado = cardsTodos.every((card) => card.valor === 0) && semRegua === 0;
  const cards = tudoZerado ? [] : cardsTodos;

  return (
    <div data-tour="estoque-saude" className="mb-4 flex flex-col gap-3">
      {cards.length > 0 && (
        <motion.div
          variants={staggerExagerado}
          initial="hidden"
          animate="show"
          // items-start (cada card com a própria altura) fazia sentido
          // quando a diferença de altura vinha de um rótulo quebrando linha
          // sem querer — hoje a diferença é só o "Parados" ter uma legenda
          // a mais (R$ parado) que os outros dois não têm. Esticar os 3 pra
          // mesma altura (padrão do grid) fica mais coeso que 3 caixas de
          // tamanhos diferentes lado a lado.
          className="grid grid-cols-3 gap-2.5 sm:gap-3"
        >
          {cards.map((card) => (
            <motion.div key={card.id} variants={entradaExagerada}>
              <AlertCard
                label={card.label}
                labelCurto={card.labelCurto}
                valor={card.valor}
                sub={card.sub}
                icon={card.icon}
                tom={card.tom}
                ativo={filtro === card.id}
                onClick={() => onFiltro(card.id)}
              />
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Nada a resolver: uma linha em vez dos três cards em zero. */}
      {tudoZerado && (
        <div
          className="flex flex-col gap-3 rounded-[1.25rem] border px-5 py-4 sm:flex-row sm:items-center"
          style={{
            borderColor: `color-mix(in srgb, ${COR.ok} 26%, transparent)`,
            background: `color-mix(in srgb, ${COR.ok} 6%, var(--card))`,
          }}
        >
          <Check size={19} strokeWidth={2.25} className="shrink-0" style={{ color: COR.ok }} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-foreground">{copy.health.calmTitle}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {copy.health.calmDescription.replace("{monitorados}", String(monitorados))}
            </p>
          </div>
        </div>
      )}

    </div>
  );
}

/* ── Trilho de estado ──────────────────────────────────────────
   Um único lugar onde o filtro vive, com uma regra só: clicar no ativo volta
   para "Todos". Antes eram duas fileiras — cards e chips — controlando o mesmo
   estado com comportamentos de toggle diferentes conforme onde a pessoa
   clicasse. O ponto colorido reusa a cor semântica da coluna de saldo, então a
   pílula e a linha do produto falam a mesma língua. */
function TrilhoEstado({ indicadores, filtro, onFiltro, className }: {
  indicadores: Indicadores | null;
  filtro: Filtro;
  onFiltro: (proximo: Filtro) => void;
  className?: string;
}) {
  return (
    <SelectPopover
      valor={filtro}
      onChange={onFiltro}
      className={className ?? "relative mb-4 inline-flex"}
      itens={[
        { value: "todos", label: copy.filters.all, contagem: indicadores?.total },
        { value: "sem_minimo", label: copy.rail.noRule, contagem: indicadores?.semMinimo, cor: "var(--border)" },
        { value: "abaixo_minimo", label: copy.filters.belowMin, contagem: indicadores?.abaixoMinimo, cor: COR.critico },
        { value: "sem_estoque", label: copy.filters.outOfStock, contagem: indicadores?.semEstoque, cor: COR.atencao },
        { value: "parados", label: copy.filters.stalled, contagem: indicadores?.parados, cor: COR.neutro },
      ]}
    />
  );
}

/* ── Divergências ──────────────────────────────────────────────
   Reconciliação noturna (A5) marca, humano decide — a correção nunca
   é automática. Só aparece quando existe algo pendente: painel que
   vive dizendo "nada aqui" só rouba espaço. */

/* ── Campo de mínimo ───────────────────────────────────────────
   Editável na própria linha: é o número que liga o alerta do A6, e
   escondê-lo dentro de um modal por produto inviabiliza um catálogo
   inteiro. Salva ao sair do campo ou no Enter.

   A confirmação é um ✓ no próprio campo, não um toast: configurar um catálogo
   é uma sequência longa de Tab-digita-Tab, e um toast global por edição
   empilharia centenas de avisos. Toast fica só para erro, que precisa
   sobreviver ao foco mudar de lugar. */
function MinimoInput({ produto, onSalvo, tamanho = "h-9 w-[68px]" }: { produto: Produto; onSalvo: (valor: number) => void; tamanho?: string }) {
  const [valor, setValor] = useState(String(produto.estoqueMinimo || ""));
  const [salvando, setSalvando] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const [minimoSincronizado, setMinimoSincronizado] = useState(produto.estoqueMinimo);
  const timerConfirmacao = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ajuste de estado durante o render (padrão recomendado do React para
  // "estado derivado de prop"): quando o lote muda o mínimo por fora, o campo
  // acompanha sem passar por um efeito e um render extra.
  if (minimoSincronizado !== produto.estoqueMinimo) {
    setMinimoSincronizado(produto.estoqueMinimo);
    setValor(String(produto.estoqueMinimo || ""));
  }

  useEffect(() => () => {
    if (timerConfirmacao.current) clearTimeout(timerConfirmacao.current);
  }, []);

  async function salvar() {
    const numero = valor.trim() === "" ? 0 : Number(valor);
    if (!Number.isInteger(numero) || numero < 0 || numero === produto.estoqueMinimo) {
      setValor(String(produto.estoqueMinimo || ""));
      return;
    }
    setSalvando(true);
    try {
      await actionDefinirEstoqueMinimoEmLote([produto.id], numero);
      onSalvo(numero);
      setConfirmado(true);
      if (timerConfirmacao.current) clearTimeout(timerConfirmacao.current);
      timerConfirmacao.current = setTimeout(() => setConfirmado(false), 1200);
    } catch {
      toast.error(copy.minimum.error);
      setValor(String(produto.estoqueMinimo || ""));
    } finally {
      setSalvando(false);
    }
  }

  const semRegua = !produto.estoqueMinimo;

  return (
    <div className="relative">
      <input
        type="number"
        min="0"
        step="1"
        inputMode="numeric"
        value={valor}
        disabled={salvando}
        aria-label={`${copy.minimum.columnLabel} — ${produto.nome}`}
        onChange={(event) => setValor(event.target.value)}
        onBlur={salvar}
        onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
        className={`${tamanho} rounded-lg bg-background px-2 pr-6 text-sm tabular-nums text-foreground text-right no-spinner focus:outline-none focus:border-[rgba(155,48,217,.5)] focus:shadow-[0_0_0_3px_rgba(155,48,217,.08)] transition-[border-color,box-shadow] disabled:opacity-50 ${
          confirmado
            ? "border border-success"
            : semRegua
              ? "border border-dashed border-border placeholder:text-muted-foreground/70"
              : "border border-border"
        }`}
      />
      <AnimatePresence>
        {confirmado && (
          <motion.span
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={springs.settleFast}
            className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2"
            aria-hidden="true"
          >
            <Check size={13} strokeWidth={3} style={{ color: COR.ok }} />
          </motion.span>
        )}
      </AnimatePresence>
      {salvando && <Loader2 size={12} className="animate-spin absolute -left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />}
    </div>
  );
}

/* ── Saldo com leitura relativa ────────────────────────────────
   A barra compara saldo × mínimo, e o rótulo abaixo do número diz o veredito
   por extenso ("mín 3", "sem estoque", "sem régua"). Sem isso a comparação
   entre duas colunas distantes ficava por conta de quem lê. Quem não tem régua
   ganha trilho tracejado: é visivelmente configurável, não visivelmente
   quebrado. */
function SaldoCelula({ saldo, minimo, testId, saldosCanais, alinhamento = "direita" }: {
  saldo: number;
  minimo: number;
  testId: string;
  saldosCanais?: SaldoCanal[];
  /** "direita" faz sentido na tabela desktop (encosta nas colunas numéricas
   *  vizinhas). No card mobile, onde o rótulo "Estoque nos canais" acima é
   *  alinhado à esquerda, "direita" brigava com o próprio rótulo — por isso
   *  o card passa "esquerda". */
  alinhamento?: "esquerda" | "direita";
}) {
  const reduzir = useReducedMotion();
  const estado = estadoLinha(saldo, minimo);
  const cor = CORES_ESTADO[estado];
  const proporcao = minimo > 0 ? Math.min(saldo / (minimo * 2), 1) : 0;

  // Vibra o número só no instante em que a linha piora (ok → abaixo/sem
  // estoque) — não no carregamento da página nem enquanto já está ruim. O
  // gatilho real de hoje é editar o mínimo: baixar a régua pode fazer uma
  // linha que já estava "ok" cair no vermelho na hora, e o tremor confirma
  // que foi aquela edição que mudou o veredito, não um refresh qualquer.
  const estadoAnterior = useRef(estado);
  const [alerta, setAlerta] = useState(false);
  useEffect(() => {
    const piorou = estado !== "ok" && estadoAnterior.current === "ok";
    estadoAnterior.current = estado;
    if (!piorou || reduzir) return;
    setAlerta(true);
    const timer = setTimeout(() => setAlerta(false), 420);
    return () => clearTimeout(timer);
  }, [estado, reduzir]);

  const rotulo = estado === "sem_estoque"
    ? copy.saldoCell.outOfStock
    : estado === "sem_regua"
      ? copy.saldoCell.noRule
      : `${copy.saldoCell.minPrefix} ${minimo}`;

  const direita = alinhamento === "direita";
  return (
    <div className={`w-full max-w-[104px] ${direita ? "ml-auto" : ""}`}>
      <motion.p
        data-testid={testId}
        animate={alerta ? { x: [0, -4, 4, -4, 4, -2, 2, 0], scale: [1, 1.12, 1] } : { x: 0, scale: 1 }}
        transition={springs.momentum}
        className={`text-[15px] font-bold tabular-nums leading-none ${direita ? "text-right" : "text-left"}`}
        style={{ color: estado === "ok" ? "var(--foreground)" : (cor ?? "var(--foreground)") }}
      >
        {saldo}
      </motion.p>
      <p
        className={`mt-1 text-[10px] leading-none tabular-nums ${direita ? "text-right" : "text-left"}`}
        style={{ color: estado === "abaixo" || estado === "sem_estoque" ? (cor ?? undefined) : "var(--muted-foreground)" }}
      >
        {rotulo}
      </p>
      {minimo > 0 ? (
        <div className="mt-1.5 h-[3px] rounded-full bg-muted overflow-hidden">
          <motion.div
            initial={reduzir ? false : { scaleX: 0 }}
            animate={{ scaleX: estado === "sem_estoque" ? 0 : proporcao }}
            transition={springs.settle}
            className="h-full rounded-full origin-left"
            style={{ background: cor ?? "var(--muted-foreground)", width: "100%" }}
          />
        </div>
      ) : (
        <div
          aria-hidden="true"
          className="mt-1.5 h-[3px] rounded-full"
          style={{ background: "repeating-linear-gradient(90deg, var(--border) 0 3px, transparent 3px 6px)" }}
        />
      )}

      {/* O número grande é o maior saldo entre os canais — o mesmo lote está
          anunciado em todos. Aqui embaixo fica de onde ele veio, para a
          diferença entre canais ficar visível em vez de escondida no máximo. */}
      {saldosCanais && saldosCanais.length > 0 && (
        <div className="mt-1.5 flex flex-col gap-0.5">
          {saldosCanais.map((item) => (
            <div key={item.canal} className={`flex items-center gap-1 ${direita ? "justify-end" : "justify-start"}`}>
              <ChannelLogo canal={item.canal} size="xs" variant="logo" />
              <span className="text-[10px] leading-none tabular-nums text-muted-foreground">
                {item.saldo}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Pulso de seleção: anel na cor da pílula que nasce colado nela e se
 *  expande sumindo — só toca quando `ativo` PASSA a ser true (monta uma
 *  vez via AnimatePresence, não é loop). Reduced motion não monta nada. */
function HaloSelecao({ ativo, cor, reduzir }: { ativo: boolean; cor: string; reduzir: boolean | null }) {
  return (
    <AnimatePresence>
      {ativo && !reduzir && (
        <motion.span
          key="halo"
          initial={{ opacity: 0.55, scale: 0.82 }}
          animate={{ opacity: 0, scale: 1.4 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{ border: `2px solid ${cor}` }}
        />
      )}
    </AnimatePresence>
  );
}

/* ── Seletor de canal ─────────────────────────────────────────
   Separa "de quem é o dado" por canal de venda (Mercado Livre, Shopee,
   TikTok Shop — ordem fechada do PRD §M3), não por marca: o saldo
   continua único, só muda quais SKUs a lista mostra. Canal sem conta
   conectada fica visível mas travado, com o motivo à vista. */
function CanalPill({ tipo, conectado, ativo, onClick }: {
  tipo: CanalVenda;
  conectado: boolean;
  ativo: boolean;
  onClick: () => void;
}) {
  const reduzir = useReducedMotion();
  const label = (channelsConfig.items as Record<string, { label?: string }>)[tipo]?.label ?? tipo;

  return (
    <motion.button
      type="button"
      variants={entradaExagerada}
      // Continua tocável mesmo desconectado — o toque mostra o motivo (toast),
      // porque `title` (tooltip) não aparece no toque em celular; um botão
      // com `disabled` de verdade nem chegaria a disparar esse toque.
      onClick={conectado ? onClick : () => toast.info(copy.channelSelector.disconnectedHint.replace("{canal}", label))}
      aria-disabled={!conectado}
      whileHover={conectado && !reduzir ? { y: -2, scale: 1.04 } : undefined}
      whileTap={!reduzir ? { scale: conectado ? 0.92 : 0.97 } : undefined}
      aria-pressed={ativo}
      aria-label={conectado ? label : `${label} — ${copy.channelSelector.disconnectedHint.replace("{canal}", label)}`}
      title={conectado ? label : copy.channelSelector.disconnectedHint.replace("{canal}", label)}
      className={`relative inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 transition-colors ${
        !conectado
          ? "border border-border opacity-50"
          : ativo
            ? "border-2 bg-card/70"
            : "border border-border/80 bg-card/40 hover:bg-card/70"
      }`}
      // Cor própria do canal quando selecionado (mesmo padrão de Avaliações),
      // não um índigo genérico — cada canal já tem identidade visual.
      style={conectado && ativo ? { borderColor: channelAccent(tipo) } : undefined}
    >
      <HaloSelecao ativo={ativo} cor={channelAccent(tipo)} reduzir={reduzir} />
      <ChannelLogo canal={tipo} size="sm" variant="logo" />
      {!conectado && <PlugZap2 size={14} className="text-muted-foreground" />}
    </motion.button>
  );
}

/* ── Seletor de empresa ───────────────────────────────────────
   Mesmo tratamento das pílulas de canal, ao lado delas: são duas perguntas
   distintas sobre o mesmo saldo — "de quem é" e "onde está anunciado" — e
   misturá-las num controle só faria o filtro mentir. O logo carrega a
   identificação (é como a pessoa reconhece a empresa), a contagem vem cruzada
   com o canal ativo, e marca sem produto no canal fica travada com o motivo
   à vista, exatamente como canal sem conta conectada.

   Não existe pílula "Todas": a tela abre sem escopo e clicar na empresa ativa
   volta para esse estado — a mesma regra de toggle do trilho de filtros. */
function MarcaPill({ nome, slug, total, ativo, indisponivelPeloCanal, onClick }: {
  nome: string;
  slug: string;
  total: number;
  ativo: boolean;
  indisponivelPeloCanal: boolean;
  onClick: () => void;
}) {
  const reduzir = useReducedMotion();
  const vazia = total === 0;
  // Uma empresa já selecionada pode zerar depois — quando o canal marcado
  // junto não tem nenhum SKU dela. Ela continua clicável para dar para
  // desmarcar; só quem nunca foi selecionada fica de fato travada em zero.
  const bloqueadaPorDados = vazia && !ativo;
  const bloqueada = bloqueadaPorDados || indisponivelPeloCanal;
  const motivoIndisponivel = `${nome} não opera nos canais selecionados.`;
  // Marca cadastrada no banco pode não ter identidade visual no config; nesse
  // caso a pílula cai no nome em texto em vez de quebrar por logo faltando.
  const temIdentidade = isBrandSlug(slug);

  return (
    <motion.button
      type="button"
      variants={entradaExagerada}
      onClick={indisponivelPeloCanal
        ? () => toast.info(motivoIndisponivel)
        : bloqueadaPorDados ? undefined : onClick}
      disabled={bloqueadaPorDados}
      aria-disabled={indisponivelPeloCanal}
      whileHover={!bloqueada && !reduzir ? { y: -2, scale: 1.04 } : undefined}
      whileTap={!bloqueada && !reduzir ? { scale: 0.92 } : undefined}
      aria-pressed={ativo}
      aria-label={nome}
      title={indisponivelPeloCanal
        ? motivoIndisponivel
        : bloqueadaPorDados ? copy.brandSelector.emptyHint.replace("{marca}", nome) : undefined}
      className={`relative inline-flex h-11 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-full px-4 transition-colors ${
        bloqueada
          ? "border border-border opacity-40 cursor-not-allowed"
          : ativo
            ? "border-2 bg-card/70"
            : "border border-border/80 bg-card/40 hover:bg-card/70"
      }`}
      style={ativo ? { borderColor: brandColor(slug) } : undefined}
    >
      <HaloSelecao ativo={ativo} cor={brandColor(slug)} reduzir={reduzir} />
      {temIdentidade
        ? <BrandLogo brand={slug} height={17} />
        : <span className="text-sm font-semibold text-foreground">{nome}</span>}
      {indisponivelPeloCanal && <PlugZap2 size={14} className="text-muted-foreground" />}
    </motion.button>
  );
}

type ConsultaEstoque = Awaited<ReturnType<typeof actionListarProdutos>>;
type ContagemCanaisEstoque = NonNullable<ConsultaEstoque["canais"]>;
type ContagemMarcasEstoque = NonNullable<ConsultaEstoque["marcas"]>;

export function EstoqueLista({ marcasIniciais = [], canaisIniciais = [] }: {
  /** Contagens já resolvidas no servidor (ver page.tsx) — chegam junto com o
   *  HTML, então as pílulas de filtro aparecem no primeiro quadro em vez de
   *  esperarem duas idas ao servidor depois que o JavaScript liga. */
  marcasIniciais?: ContagemMarcasEstoque;
  canaisIniciais?: ContagemCanaisEstoque;
}) {
  const reduzir = useReducedMotion();
  const [produtos, setProdutos]   = useState<Produto[]>([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(false);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [busca, setBusca]         = useState("");
  // Empresa e canal aceitam mais de uma marcada ao mesmo tempo — Set em vez de
  // string, com o mesmo toggle de sempre (clicar na ativa desmarca).
  const [brandIds, setBrandIds]   = useState<ReadonlySet<string>>(new Set());
  const [canaisSelecionados, setCanaisSelecionados] = useState<ReadonlySet<CanalVenda>>(new Set());
  const [canais, setCanais]       = useState<ContagemCanaisEstoque>(canaisIniciais);
  const [filtro, setFiltro]       = useState<Filtro>("todos");
  const [canManage, setCanManage] = useState(false);
  const requestId = useRef(0);
  const filterRequestId = useRef(0);
  const [, startTransition]       = useTransition();
  const [marcas, setMarcas] = useState<ContagemMarcasEstoque>(marcasIniciais);
  const [indicadores, setIndicadores] = useState<Indicadores | null>(null);
  const [erroIndicadores, setErroIndicadores] = useState(false);
  const [parados, setParados] = useState<Map<string, ProdutoParado>>(new Map());
  const [selecionados, setSelecionados] = useState<ReadonlySet<string>>(new Set());
  const [minimoLote, setMinimoLote] = useState("");
  const [aplicandoLote, setAplicandoLote] = useState(false);

  // Set muda de referência a cada toggle — para os efeitos abaixo não
  // dispararem em loop comparando array por identidade, a dependência real é
  // uma chave estável (mesmo padrão de serialização usado no wizard de régua).
  const brandIdsArray = useMemo(() => [...brandIds], [brandIds]);
  const canaisArray = useMemo(() => [...canaisSelecionados], [canaisSelecionados]);
  const brandIdsKey = brandIdsArray.slice().sort().join(",");
  const canaisKey = canaisArray.slice().sort().join(",");

  const carregarIndicadores = useCallback((marcas?: string[], canaisAtuais?: string[]) => {
    // O app inteiro divide uma única conexão com o banco (RLS exige pooler em
    // session mode — ver src/shared/lib/db/index.ts); sob rajada de webhook do
    // Mercado Livre, esta busca pode ficar na fila. Sem um teto, o card gira
    // pra sempre sem nenhuma pista de que travou em vez de estar a caminho.
    const semResposta = new Promise<never>((_resolve, reject) => {
      setTimeout(() => reject(new Error("timeout")), 20_000);
    });
    Promise.race([
      actionIndicadoresEstoque(marcas?.length ? marcas : undefined, canaisAtuais?.length ? canaisAtuais : undefined),
      semResposta,
    ])
      .then((resultado) => {
        setIndicadores(resultado);
        setErroIndicadores(false);
      })
      .catch(() => {
        // erro !== "ainda carregando": sem essa distinção o card ficava preso
        // no mesmo texto "Verificando…" mesmo depois de desistir, porque
        // indicadores===null é o estado inicial E o de falha. Falha aqui é
        // silenciosa — sem card de erro, sem toast; a lista de produtos
        // (o que importa de verdade) não depende disso.
        setIndicadores(null);
        setErroIndicadores(true);
      });
  }, []);

  const carregar = useCallback((marcas?: string[], termo?: string, estado?: Filtro, canaisAtuais?: string[]) => {
    const currentRequest = ++requestId.current;
    startTransition(async () => {
      setLoading(true);
      try {
        const res = await actionListarProdutos({
          brandIds: marcas?.length ? marcas : undefined,
          busca: termo || undefined,
          estado: estado && estado !== "todos" ? estado : undefined,
          canalTipos: canaisAtuais?.length ? canaisAtuais : undefined,
          incluirContexto: true,
        });
        if (currentRequest !== requestId.current) return;
        setProdutos(res.data as Produto[]);
        setTotal(res.total);
        setCanManage(res.permissions.canManage);
        if (res.marcas) setMarcas(res.marcas);
        if (res.canais) setCanais(res.canais);
        if (res.indicadores) {
          setIndicadores(res.indicadores);
          setErroIndicadores(false);
        }
        setSelecionados(new Set());
      } catch {
        if (currentRequest !== requestId.current) return;
        toast.error(copy.messages.loadError);
      } finally {
        if (currentRequest === requestId.current) setLoading(false);
      }
    });
  }, []);

  /* A empresa é o que abre a lista — canal sozinho não abre. Um canal tem as
     três empresas dentro, então revelar a lista por canal traria justamente as
     três misturadas, que é o que a tela existe para evitar. Canal segue como
     estreitador: recontagem as pílulas de empresa e, depois de escolhida uma,
     recorta a lista dela. Busca abre porque um SKU já é um escopo exato.

     Sem escopo não há o que carregar: a tela mostra o convite. O que sobrou de
     uma seleção anterior fica em memória sem ser renderizado, então voltar
     para a empresa não provoca aquecimento em segundo plano. */
  const escopoDefinido = brandIds.size > 0 || busca.trim() !== "";

  useAtualizacaoLocal("estoque", useCallback(() => {
    if (!escopoDefinido) return;
    carregar(brandIdsArray, busca, filtro, canaisArray);
    carregarIndicadores(brandIdsArray, canaisArray);
  }, [escopoDefinido, carregar, carregarIndicadores, brandIdsArray, canaisArray, busca, filtro]), { fontes: ["estoque"] });

  // Recuperação leve para navegação cliente ou falha do carregamento inicial.
  // Também mantém as contagens cruzadas quando só o canal está marcado, sem
  // buscar produtos, indicadores ou bloquear os controles.
  useEffect(() => {
    const precisaRecuperarIniciais = marcas.length === 0 && canais.length === 0;
    const somenteCanalMudou = !escopoDefinido && canaisSelecionados.size > 0;
    if (!precisaRecuperarIniciais && !somenteCanalMudou) return;

    const currentRequest = ++filterRequestId.current;
    actionObterFiltrosEstoque({
      canalTipos: canaisArray.length ? canaisArray : undefined,
    })
      .then((resultado) => {
        if (currentRequest !== filterRequestId.current) return;
        setMarcas(resultado.marcas);
        setCanais(resultado.canais);
      })
      .catch(() => {
        // A área de resultados comunica falhas; os filtros permanecem tocáveis.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canaisKey, escopoDefinido]);

  useEffect(() => {
    if (!escopoDefinido) return;
    const timer = setTimeout(() => carregar(brandIdsArray, busca, filtro, canaisArray), busca ? 300 : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandIdsKey, busca, filtro, canaisKey, carregar, escopoDefinido]);

  // Detalhe de encalhe (dias parado, capital preso) só interessa quando a
  // pessoa está olhando justamente esses produtos.
  useEffect(() => {
    if (filtro !== "parados") return;
    let cancelado = false;
    actionListarProdutosParados()
      .then((itens) => { if (!cancelado) setParados(new Map(itens.map((item) => [item.id, item]))); })
      .catch(() => { if (!cancelado) setParados(new Map()); });
    return () => { cancelado = true; };
  }, [filtro]);

  async function carregarMais() {
    setCarregandoMais(true);
    try {
      const res = await actionListarProdutos({
        brandIds: brandIdsArray.length ? brandIdsArray : undefined,
        busca: busca || undefined,
        estado: filtro !== "todos" ? filtro : undefined,
        canalTipos: canaisArray.length ? canaisArray : undefined,
        offset: produtos.length,
      });
      setProdutos((atual) => [...atual, ...(res.data as Produto[])]);
      setTotal(res.total);
    } catch {
      toast.error(copy.messages.loadError);
    } finally {
      setCarregandoMais(false);
    }
  }

  function alternarSelecao(id: string) {
    setSelecionados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  function alternarTodos() {
    setSelecionados((atual) => atual.size === produtos.length ? new Set() : new Set(produtos.map((p) => p.id)));
  }

  async function aplicarMinimoEmLote() {
    const numero = Number(minimoLote);
    if (!Number.isInteger(numero) || numero < 0) return;
    setAplicandoLote(true);
    try {
      const ids = [...selecionados];
      await actionDefinirEstoqueMinimoEmLote(ids, numero);
      setProdutos((atual) => atual.map((p) => selecionados.has(p.id) ? { ...p, estoqueMinimo: numero } : p));
      setSelecionados(new Set());
      setMinimoLote("");
      toast.success(copy.bulk.success.replace("{n}", String(ids.length)));
      carregarIndicadores(brandIdsArray, canaisArray);
    } catch {
      toast.error(copy.bulk.error);
    } finally {
      setAplicandoLote(false);
    }
  }

  function aoSalvarMinimo(produtoId: string, valor: number) {
    setProdutos((atual) => atual.map((p) => p.id === produtoId ? { ...p, estoqueMinimo: valor } : p));
    carregarIndicadores(brandIdsArray, canaisArray);
  }

  function trocarFiltro(proximo: Filtro) {
    setFiltro((atual) => atual === proximo ? "todos" : proximo);
  }

  function alternarMarca(brandId: string) {
    const marca = marcas.find((item) => item.brandId === brandId);
    if (marca && !marcaDisponivelNosCanais(marca.slug, canaisArray)) {
      toast.info(`${marca.name} não opera nos canais selecionados.`);
      return;
    }
    setBrandIds((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(brandId)) proximo.delete(brandId);
      else proximo.add(brandId);
      return proximo;
    });
  }

  function alternarCanal(tipo: CanalVenda) {
    const proximosCanais = new Set(canaisSelecionados);
    if (proximosCanais.has(tipo)) proximosCanais.delete(tipo);
    else proximosCanais.add(tipo);
    const canaisLista = [...proximosCanais];
    setCanaisSelecionados(proximosCanais);
    setBrandIds((atuais) => new Set(ajustarMarcasSelecionadasAosCanais(
      [...atuais],
      canaisLista,
      marcas.map((marca) => ({ id: marca.brandId, slug: marca.slug })),
    )));
  }

  const filtrando = filtro !== "todos" || busca.trim() !== "" || brandIds.size > 0 || canaisSelecionados.size > 0;

  // Vazio depois de filtrar não é sempre a mesma notícia: "nada abaixo do
  // mínimo" é boa, "nada com esses filtros" é só ajuste de busca.
  const ilustracaoVazio = !filtrando
    ? "restock"
    : filtro === "abaixo_minimo" || filtro === "sem_estoque"
      ? "healthyStock"
      : filtro === "parados"
        ? "deadStock"
        : filtro === "sem_minimo"
          ? "noThreshold"
          : "slowMoving";

  return (
    <div>
      {/* Filtros e ações administrativas na mesma linha — antes eram dois
          blocos empilhados (botões, depois um bloco centralizado enorme só
          para os filtros), consumindo altura sem motivo: filtro e ação
          convivem bem lado a lado, como em Clientes. */}
      {/* Cada grupo rola na horizontal no mobile em vez de quebrar linha
          (mesmo padrão de Vendas) — evita que o divisor entre marca/canal
          fique órfão numa quebra e mantém a fileira previsível independente
          de quantas marcas/canais existirem. */}
      <motion.div variants={staggerExagerado} initial="hidden" animate="show" className="mb-4 flex flex-col items-center gap-2.5 lg:w-fit lg:mx-auto lg:flex-row lg:flex-wrap lg:gap-3">
        <motion.div variants={staggerExagerado} data-tour="estoque-empresa" className="order-2 flex w-full justify-center gap-2 overflow-x-auto overscroll-x-contain px-0.5 scrollbar-none lg:order-none lg:w-auto lg:flex-wrap lg:overflow-visible">
          {marcas.map((marca) => (
            <MarcaPill
              key={marca.brandId}
              nome={marca.name}
              slug={marca.slug}
              total={marca.total}
              ativo={brandIds.has(marca.brandId)}
              indisponivelPeloCanal={!marcaDisponivelNosCanais(marca.slug, canaisArray)}
              onClick={() => alternarMarca(marca.brandId)}
            />
          ))}
        </motion.div>

        <span aria-hidden="true" className="hidden h-5 w-px bg-border lg:block" />

        <motion.div variants={staggerExagerado} className="order-1 flex w-full justify-center gap-2 overflow-x-auto overscroll-x-contain px-0.5 scrollbar-none lg:order-none lg:w-auto lg:flex-wrap lg:overflow-visible">
          {canais.map((item) => (
            <CanalPill
              key={item.tipo}
              tipo={item.tipo}
              conectado={item.conectado}
              ativo={canaisSelecionados.has(item.tipo)}
              onClick={() => alternarCanal(item.tipo)}
            />
          ))}
        </motion.div>
        {/* "Sincronizar" e "Configurar alertas" saíram daqui: viraram
            entradas fixas em Configurações (Central de sincronização e
            Áreas administrativas) — não precisam de destaque permanente
            na tela de listagem do dia a dia. */}
      </motion.div>

      {escopoDefinido && (
        <FaixaSaude
          indicadores={indicadores}
          erro={erroIndicadores}
          filtro={filtro}
          onFiltro={trocarFiltro}
        />
      )}

      <div className="mb-4 flex items-center gap-2 rounded-[1.25rem] bg-card p-2 shadow-[0_2px_16px_rgba(14,15,19,.07)]">
        <div className="relative min-w-0 flex-1 lg:min-w-[16rem]">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder={copy.searchPlaceholder}
            className="min-h-11 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-sm focus:outline-none focus:border-[rgba(155,48,217,.5)] focus:shadow-[0_0_0_3px_rgba(155,48,217,.08)] transition-[border-color,box-shadow]"
          />
        </div>
        {escopoDefinido && (
          <TrilhoEstado indicadores={indicadores} filtro={filtro} onFiltro={trocarFiltro} className="relative inline-flex shrink-0" />
        )}
      </div>

      {/* Barra de ação em massa — atalho para quem já está com a lista
          filtrada na mão; a configuração do catálogo inteiro é o wizard. */}
      <AnimatePresence>
        {canManage && selecionados.size > 0 && (
          <motion.div
            initial={reduzir ? false : { opacity: 0, y: -6, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={reduzir ? undefined : { opacity: 0, y: -6, height: 0 }}
            transition={springs.settleFast}
            className="mb-3 overflow-hidden"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1rem] border border-[rgba(37,99,235,.25)] bg-[rgba(37,99,235,.06)] px-4 py-3">
              <span className="text-sm font-semibold" style={{ color: COR.info }}>
                {selecionados.size === 1
                  ? copy.bulk.selectedSingular
                  : copy.bulk.selectedPlural.replace("{n}", String(selecionados.size))}
              </span>
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium" style={{ color: COR.info }}>{copy.bulk.setMinimum}</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={minimoLote}
                  onChange={(event) => setMinimoLote(event.target.value)}
                  className="h-9 w-[72px] rounded-lg border border-border bg-background px-2 text-sm tabular-nums text-right no-spinner"
                />
                <button
                  type="button"
                  onClick={aplicarMinimoEmLote}
                  disabled={aplicandoLote || minimoLote.trim() === ""}
                  className="min-h-11 inline-flex items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-white disabled:opacity-50"
                  style={{ background: COR.info }}
                >
                  {aplicandoLote && <Loader2 size={13} className="animate-spin" />}
                  {aplicandoLote ? copy.bulk.applying : copy.bulk.apply}
                </button>
                <button
                  type="button"
                  onClick={() => setSelecionados(new Set())}
                  className="min-h-11 px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  {copy.bulk.clear}
                </button>
              </div>
            </div>
            <p className="mt-1.5 px-1 text-[11px] text-muted-foreground">{copy.minimum.hint}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tela limpa: sem escopo, nada de tabela. O que ocupa o lugar dela é o
          convite — e o rodapé diz que os produtos já estão vindo, para a espera
          do clique não parecer tempo perdido. */}
      {!escopoDefinido ? (
        <motion.div
          initial={reduzir ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springs.settleFast}
          data-testid="estoque-escolha-empresa"
          className="rounded-[1.25rem] bg-card shadow-[0_2px_16px_rgba(14,15,19,.07)]"
        >
          <EmptyState
            illustration="restock"
            title={copy.escolha.title}
            description={
              <span className="flex items-center justify-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <Check size={12} strokeWidth={3} style={{ color: COR.ok }} />
                {copy.escolha.readyHint}
              </span>
            }
          />
        </motion.div>
      ) : (
      <motion.div
        initial={reduzir ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springs.settleFast}
        className="rounded-[1.25rem] bg-card shadow-[0_2px_16px_rgba(14,15,19,.07)] overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-border flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <p className="text-sm font-semibold text-foreground">{copy.sectionTitle}</p>
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            {/* Sem key: o total é dado crítico e não deve re-animar a cada
                filtro (PRD §14.5 — "número não dança depois de carregado"). */}
            <span className="shrink-0 whitespace-nowrap rounded-full bg-selecionado/10 px-2.5 py-1 text-xs font-bold text-selecionado tabular-nums">
              {total} {total === 1 ? "produto" : "produtos"}
            </span>
          </div>
        </div>

        {/* Skeleton só na primeira carga. Re-filtrar mantém a lista anterior no
            lugar, esmaecida: trocar lista por skeleton e de volta era o que
            fazia a tabela piscar a cada tecla digitada na busca — e o
            AnimatePresence com mode="wait" ainda somava a espera da saída. */}
        <div
          className={loading && produtos.length > 0 ? "pointer-events-none opacity-55 transition-opacity" : "transition-opacity"}
          aria-busy={loading || undefined}
        >
          {loading && produtos.length === 0 ? (
            <div>
              {[...Array(5)].map((_, i) => <SkeletonRow key={i} />)}
            </div>
          ) : produtos.length === 0 ? (
            <div>
              <EmptyState
                illustration={ilustracaoVazio}
                title={filtrando ? copy.emptyFiltered.title : copy.empty.title}
                description={filtrando ? copy.emptyFiltered.description : copy.empty.description}
                action={undefined}
              />
            </div>
          ) : (
            <div>
              {/* Mobile: cartão com os campos que decidem — saldo e mínimo */}
              <motion.div variants={staggerExagerado} initial="hidden" animate="show" className="md:hidden divide-y divide-border" data-testid="estoque-cards">
                {produtos.map((p) => {
                  const saldo = p.saldo ?? 0;
                  const parado = filtro === "parados" ? parados.get(p.id) : undefined;
                  const estado = estadoLinha(saldo, p.estoqueMinimo);
                  const corEstado = CORES_ESTADO[estado];
                  return (
                    <motion.article key={p.id} variants={variantes(reduzir, entradaExagerada)} className="relative p-4 pl-5 space-y-3">
                      <span
                        aria-hidden="true"
                        className="absolute left-0 top-4 bottom-4 w-1 rounded-r-sm"
                        style={corEstado
                          ? { background: corEstado }
                          : { background: "repeating-linear-gradient(180deg, var(--border) 0 3px, transparent 3px 6px)" }}
                      />
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground">{p.nome}</p>
                          {/* SKU/Empresa/Canal são 3 atributos do mesmo tipo — antes
                              cada um tinha um tratamento visual diferente (pílula,
                              texto com rótulo, ícone solto). Agora é uma linha só,
                              separada por · , mesmo padrão usado em Vendas. */}
                          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
                            <span className="font-mono">{p.sku}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-semibold" style={{ color: brandColor(p.brandSlug) }}>{p.brandName}</span>
                            {p.canais && p.canais.length > 0 && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="inline-flex items-center gap-1">
                                  {p.canais.map((c) => <ChannelLogo key={c} canal={c} size="xs" variant="logo" />)}
                                </span>
                              </>
                            )}
                          </div>
                          {parado && (
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              {parado.diasSemVenda} {copy.parados.daysSuffix} · {dinheiro.format(parado.capitalParado)}
                            </p>
                          )}
                        </div>
                        {canManage && (
                          // Alvo de toque de 44px em volta do quadradinho de 16px —
                          // sem o padding, o checkbox sozinho é pequeno demais pra
                          // acertar o toque com confiança numa lista de 142 itens.
                          <label className="-m-2.5 flex h-11 w-11 shrink-0 items-center justify-center p-2.5">
                            <input
                              type="checkbox"
                              checked={selecionados.has(p.id)}
                              onChange={() => alternarSelecao(p.id)}
                              aria-label={`Selecionar ${p.nome}`}
                              className="h-4 w-4 shrink-0 accent-selecionado"
                            />
                          </label>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-sm items-end">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">{copy.mobile.balance}</p>
                          <SaldoCelula saldo={saldo} minimo={p.estoqueMinimo} testId={`saldo-${p.sku}`} saldosCanais={p.saldosCanais} alinhamento="esquerda" />
                        </div>
                        <div data-tour={p === produtos[0] ? "estoque-minimo" : undefined}>
                          <p className="text-xs text-muted-foreground mb-1">{copy.minimum.columnLabel}</p>
                          {canManage
                            ? <MinimoInput produto={p} onSalvo={(valor) => aoSalvarMinimo(p.id, valor)} tamanho="h-11 w-[72px]" />
                            : <p className="font-semibold tabular-nums">{p.estoqueMinimo || "Sem mínimo"}</p>}
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">{copy.mobile.price}</p>
                          <p className="font-semibold tabular-nums">{dinheiro.format(Number(p.preco))}</p>
                        </div>
                      </div>
                      {canManage && (
                        <div className="flex min-h-11 items-center justify-end gap-2">
                          <Link
                            href={`/estoque/produtos/${p.id}`}
                            title="Ver produto"
                            aria-label="Ver produto"
                            className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground shadow-[0_1px_2px_rgba(14,15,19,.05)] transition-colors hover:border-[rgba(155,48,217,.4)] hover:bg-muted active:scale-[.97]"
                          >
                            <Eye size={14} strokeWidth={2} /> Ver
                          </Link>
                        </div>
                      )}
                    </motion.article>
                  );
                })}
              </motion.div>

              <div className="hidden md:block table-scroll" data-testid="estoque-table">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      {canManage && (
                        <th className="w-10 px-5 py-3">
                          <input
                            type="checkbox"
                            checked={selecionados.size > 0 && selecionados.size === produtos.length}
                            onChange={alternarTodos}
                            aria-label="Selecionar todos"
                            className="h-4 w-4 accent-selecionado"
                          />
                        </th>
                      )}
                      {copy.columns.map((h, i) => (
                        <th
                          key={i}
                          // A última coluna é a das ações por linha e não tem
                          // rótulo visível — sem o aria-label o cabeçalho fica
                          // anônimo para leitor de tela.
                          aria-label={h === "" ? "Ações" : undefined}
                          className={`px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide ${
                            i === 0 ? "text-left" : i === 3 ? "hidden lg:table-cell text-right" : "text-right"
                          }`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {produtos.map((p, i) => {
                      const saldo = p.saldo ?? 0;
                      const parado = filtro === "parados" ? parados.get(p.id) : undefined;
                      const selecionado = selecionados.has(p.id);
                      const estado = estadoLinha(saldo, p.estoqueMinimo);
                      const corEstado = CORES_ESTADO[estado];
                      return (
                        // Linha sem animação de entrada própria: a cascata por
                        // linha recomeçava a cada filtro (as chaves mudam, tudo
                        // remonta) e custava até 240ms de recomeço visual. O
                        // fade único do cartão que envolve a tabela já dá a
                        // entrada, e o dado crítico aparece de imediato.
                        <tr
                          key={p.id}
                          className={`border-b border-border last:border-0 transition-colors ${selecionado ? "bg-[rgba(37,99,235,.05)]" : "hover:bg-muted/40"}`}
                        >
                          {canManage && (
                            <td className="relative px-5 py-3.5">
                              <span
                                aria-hidden="true"
                                className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-sm"
                                style={corEstado
                                  ? { background: corEstado }
                                  : { background: "repeating-linear-gradient(180deg, var(--border) 0 3px, transparent 3px 6px)" }}
                              />
                              <input
                                type="checkbox"
                                checked={selecionado}
                                onChange={() => alternarSelecao(p.id)}
                                aria-label={`Selecionar ${p.nome}`}
                                className="h-4 w-4 accent-selecionado"
                              />
                            </td>
                          )}
                          <td className="relative px-5 py-3.5">
                            {!canManage && (
                              <span
                                aria-hidden="true"
                                className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-sm"
                                style={corEstado
                                  ? { background: corEstado }
                                  : { background: "repeating-linear-gradient(180deg, var(--border) 0 3px, transparent 3px 6px)" }}
                              />
                            )}
                            <p className="font-medium text-foreground">{p.nome}</p>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              <span className="font-mono text-[11px] text-muted-foreground bg-muted rounded px-1.5 py-0.5">SKU: {p.sku}</span>
                              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                Empresa:
                                {isBrandSlug(p.brandSlug)
                                  ? <BrandLogo brand={p.brandSlug} height={13} />
                                  : <span className="font-semibold" style={{ color: brandColor(p.brandSlug) }}>{p.brandName}</span>}
                              </span>
                              {p.canais && p.canais.length > 0 && (
                                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                  Canal:
                                  {p.canais.map((c) => <ChannelLogo key={c} canal={c} size="xs" variant="logo" />)}
                                </span>
                              )}
                            </div>
                            {parado && (
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                {parado.diasSemVenda} {copy.parados.daysSuffix} · {dinheiro.format(parado.capitalParado)} {copy.indicators.capitalPrefix}
                              </p>
                            )}
                          </td>
                          <td className="px-5 py-3.5">
                            <SaldoCelula saldo={saldo} minimo={p.estoqueMinimo} testId={`saldo-${p.sku}`} saldosCanais={p.saldosCanais} />
                          </td>
                          <td className="px-5 py-3.5" data-tour={i === 0 ? "estoque-minimo" : undefined}>
                            <div className="flex justify-end">
                              {canManage
                                ? <MinimoInput produto={p} onSalvo={(valor) => aoSalvarMinimo(p.id, valor)} />
                                : <span className="tabular-nums text-muted-foreground">{p.estoqueMinimo || "Sem mínimo"}</span>}
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-right font-semibold text-foreground tabular-nums hidden lg:table-cell">
                            {dinheiro.format(Number(p.preco))}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            {canManage && (
                              <div className="flex items-center justify-end gap-2">
                                <Link
                                  href={`/estoque/produtos/${p.id}`}
                                  title="Ver produto"
                                  aria-label="Ver produto"
                                  className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-card text-foreground shadow-[0_1px_2px_rgba(14,15,19,.05)] transition-colors hover:border-selecionado/40 hover:bg-muted active:scale-[.97]"
                                >
                                  <Eye size={14} strokeWidth={2} />
                                </Link>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Paginação — sem isto, um catálogo de centenas de SKUs fica
                  inacessível depois do quinquagésimo item. */}
              {produtos.length < total && (
                <div className="border-t border-border px-5 py-4 text-center">
                  <motion.button
                    whileHover={reduzir ? undefined : { scale: 1.02 }}
                    whileTap={reduzir ? undefined : { scale: 0.98 }}
                    onClick={carregarMais}
                    disabled={carregandoMais}
                    className="min-h-10 inline-flex items-center gap-2 rounded-[0.75rem] border border-border px-5 text-sm font-semibold text-foreground hover:bg-muted transition-colors disabled:opacity-60"
                  >
                    {carregandoMais && <Loader2 size={14} className="animate-spin" />}
                    {carregandoMais
                      ? copy.pagination.loadingMore
                      : `${copy.pagination.loadMore} ${Math.min(PAGINA, total - produtos.length)}`}
                  </motion.button>
                  <p className="mt-2 text-[11px] text-muted-foreground tabular-nums">
                    {copy.pagination.showing
                      .replace("{carregados}", String(produtos.length))
                      .replace("{total}", String(total))}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
      )}


      {/* Tour só depois de haver o que apontar — com a tela ainda em skeleton,
          os alvos não existem e os balões apontariam para o vazio. */}
      {!loading && produtos.length > 0 && (
        <CoachMarks storageKey={copy.coach.storageKey} steps={TOUR} />
      )}
    </div>
  );
}
