"use client";

import { useState, useCallback, useEffect, useRef, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  AlertTriangle, Check, Eye, Hourglass, Link2, Loader2, PackageX, Pencil, PlugZap2,
  RefreshCw, Search, SlidersHorizontal,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { CanalModal } from "./canal-modal";
import {
  actionListarProdutos, actionListarProdutosParados,
  actionImportarCatalogoEstoque,
  actionIndicadoresEstoque, actionDefinirEstoqueMinimoEmLote, actionContarProdutosPorCanal,
  actionContarProdutosPorMarca,
} from "./actions";
import { SkeletonRow } from "@/shared/design-system/primitives/Skeleton";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { ChannelLogo } from "@/shared/design-system/primitives/ChannelLogo";
import { BrandLogo } from "@/shared/design-system/primitives/BrandLogo";
import { BrandLogoGroup } from "@/shared/design-system/primitives/BrandLogoGroup";
import { CoachMarks, type CoachMarkStep } from "@/shared/design-system/primitives/CoachMarks";
import { springs } from "@/shared/design-system/motion-variants";
import { NumeroAnimado } from "@/shared/design-system/primitives/NumeroAnimado";
import pagesConfig from "@/config/pages.json";
import channelsConfig from "@/config/channels.json";
import { getBrandConfig, isBrandSlug } from "@/shared/config/brands";

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

const COR = { critico: "#C21820", atencao: "#B57A00", ok: "#1F8A4C", info: "#2563EB", neutro: "#6F6F6E" };

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
   Só existe quando o valor é maior que zero. Um card anunciando "0" ocupa o
   mesmo espaço do card que exige ação e ensina a pessoa a ignorar a faixa. */
function AlertCard({ label, valor, sub, icon: Icon, tom, ativo, onClick }: {
  label: string;
  valor: number;
  sub?: string;
  icon: LucideIcon;
  tom: "danger" | "warning" | "neutro";
  ativo: boolean;
  onClick: () => void;
}) {
  const reduzir = useReducedMotion();
  const cor = tom === "danger" ? COR.critico : tom === "warning" ? COR.atencao : "var(--muted-foreground)";
  const destaque = tom !== "neutro";

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={reduzir ? undefined : { y: -2 }}
      whileTap={reduzir ? undefined : { scale: 0.98 }}
      transition={springs.settleFast}
      aria-pressed={ativo}
      className="rounded-[1.25rem] bg-card p-4 text-left shadow-[0_2px_16px_rgba(14,15,19,.07)] transition-[box-shadow,border-color] border-2"
      style={{
        borderColor: ativo ? cor : "transparent",
        background: destaque ? `color-mix(in srgb, ${cor} 7%, var(--card))` : undefined,
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon size={15} strokeWidth={1.75} style={{ color: destaque ? cor : "var(--muted-foreground)" }} />
        <span className="text-xs font-semibold" style={{ color: destaque ? cor : "var(--muted-foreground)" }}>
          {label}
        </span>
      </div>
      <NumeroAnimado
        valor={valor}
        className="block text-[26px] font-bold leading-none tabular-nums tracking-[-0.02em]"
        style={{ color: destaque ? cor : "var(--foreground)" }}
      />
      {sub && <p className="mt-1.5 text-[11px] text-muted-foreground">{sub}</p>}
    </motion.button>
  );
}

/* ── Faixa de saúde ────────────────────────────────────────────
   Adaptativa de propósito: o espaço segue o problema. Com alerta ativo, os
   indicadores que têm valor viram cards; sem alerta, a faixa inteira colapsa
   numa linha e devolve a altura para a lista de produtos — que é o trabalho
   real da tela. Enquanto não sabemos os números, não afirmamos nada: mostrar
   "0" enquanto carrega é dizer "tudo em ordem" antes de conferir. */
function FaixaSaude({ indicadores, filtro, onFiltro }: {
  indicadores: Indicadores | null;
  filtro: Filtro;
  onFiltro: (proximo: Filtro) => void;
}) {
  const hc = copy.health;

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

  const cards = [
    {
      id: "abaixo_minimo" as Filtro,
      label: copy.indicators.belowMin,
      valor: indicadores.abaixoMinimo,
      icon: AlertTriangle,
      tom: "danger" as const,
      sub: undefined as string | undefined,
    },
    {
      id: "sem_estoque" as Filtro,
      label: copy.indicators.outOfStock,
      valor: indicadores.semEstoque,
      icon: PackageX,
      tom: "warning" as const,
      sub: undefined as string | undefined,
    },
    {
      id: "parados" as Filtro,
      label: copy.indicators.stalled,
      valor: indicadores.parados,
      icon: Hourglass,
      tom: "neutro" as const,
      sub: indicadores.capitalParado > 0
        ? `${dinheiro.format(indicadores.capitalParado)} ${copy.indicators.capitalPrefix}`
        : undefined,
    },
  ].filter((card) => card.valor > 0);

  const semRegua = indicadores.semMinimo;
  const monitorados = Math.max(indicadores.total - semRegua, 0);

  return (
    <div data-tour="estoque-saude" className="mb-4 flex flex-col gap-3">
      {cards.length > 0 && (
        <div className={`grid gap-3 ${cards.length === 1 ? "grid-cols-1 sm:max-w-xs" : cards.length === 2 ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-3"}`}>
          {cards.map((card) => (
            <AlertCard
              key={card.id}
              label={card.label}
              valor={card.valor}
              sub={card.sub}
              icon={card.icon}
              tom={card.tom}
              ativo={filtro === card.id}
              onClick={() => onFiltro(card.id)}
            />
          ))}
        </div>
      )}

      {/* Nada a resolver: uma linha em vez de quatro cards em zero. */}
      {cards.length === 0 && semRegua === 0 && (
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
function TrilhoEstado({ indicadores, filtro, onFiltro }: {
  indicadores: Indicadores | null;
  filtro: Filtro;
  onFiltro: (proximo: Filtro) => void;
}) {
  const reduzir = useReducedMotion();

  const itens: Array<{ id: Filtro; label: string; contagem?: number; cor?: string }> = [
    { id: "todos", label: copy.filters.all, contagem: indicadores?.total },
    { id: "sem_minimo", label: copy.rail.noRule, contagem: indicadores?.semMinimo, cor: "var(--border)" },
    { id: "abaixo_minimo", label: copy.filters.belowMin, contagem: indicadores?.abaixoMinimo, cor: COR.critico },
    { id: "sem_estoque", label: copy.filters.outOfStock, contagem: indicadores?.semEstoque, cor: COR.atencao },
    { id: "parados", label: copy.filters.stalled, contagem: indicadores?.parados, cor: COR.neutro },
  ];

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {itens.map((item) => {
        const ativo = filtro === item.id;
        return (
          <motion.button
            key={item.id}
            type="button"
            whileTap={reduzir ? undefined : { scale: 0.96 }}
            onClick={() => onFiltro(item.id)}
            aria-pressed={ativo}
            className={`inline-flex min-h-9 items-center gap-2 rounded-full px-3.5 text-xs font-semibold transition-colors ${
              ativo
                ? "border-2 border-[#9B30D9] bg-[rgba(155,48,217,.07)] text-foreground"
                : "border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {item.cor && (
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: item.cor }}
              />
            )}
            {item.label}
            {item.contagem !== undefined && (
              <span className="tabular-nums opacity-60">{item.contagem}</span>
            )}
          </motion.button>
        );
      })}
    </div>
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
function MinimoInput({ produto, onSalvo }: { produto: Produto; onSalvo: (valor: number) => void }) {
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
        className={`h-9 w-[68px] rounded-lg bg-background px-2 pr-6 text-sm tabular-nums text-foreground text-right no-spinner focus:outline-none focus:border-[rgba(155,48,217,.5)] focus:shadow-[0_0_0_3px_rgba(155,48,217,.08)] transition-[border-color,box-shadow] disabled:opacity-50 ${
          confirmado
            ? "border border-[#1F8A4C]"
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
function SaldoCelula({ saldo, minimo, testId, saldosCanais }: {
  saldo: number;
  minimo: number;
  testId: string;
  saldosCanais?: SaldoCanal[];
}) {
  const reduzir = useReducedMotion();
  const estado = estadoLinha(saldo, minimo);
  const cor = CORES_ESTADO[estado];
  const proporcao = minimo > 0 ? Math.min(saldo / (minimo * 2), 1) : 0;

  const rotulo = estado === "sem_estoque"
    ? copy.saldoCell.outOfStock
    : estado === "sem_regua"
      ? copy.saldoCell.noRule
      : `${copy.saldoCell.minPrefix} ${minimo}`;

  return (
    <div className="w-[104px] ml-auto">
      <p
        data-testid={testId}
        className="text-[15px] font-bold tabular-nums leading-none text-right"
        style={{ color: estado === "ok" ? "var(--foreground)" : (cor ?? "var(--foreground)") }}
      >
        {saldo}
      </p>
      <p
        className="mt-1 text-right text-[10px] leading-none tabular-nums"
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
            <div key={item.canal} className="flex items-center justify-end gap-1">
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

/* ── Seletor de canal ─────────────────────────────────────────
   Separa "de quem é o dado" por canal de venda (Mercado Livre, Shopee,
   TikTok Shop — ordem fechada do PRD §M3), não por marca: o saldo
   continua único, só muda quais SKUs a lista mostra. Canal sem conta
   conectada fica visível mas travado, com o motivo à vista. */
function CanalPill({ tipo, total, conectado, ativo, onClick }: {
  tipo: CanalVenda;
  total: number;
  conectado: boolean;
  ativo: boolean;
  onClick: () => void;
}) {
  const reduzir = useReducedMotion();
  const label = (channelsConfig.items as Record<string, { label?: string }>)[tipo]?.label ?? tipo;

  return (
    <motion.button
      type="button"
      onClick={conectado ? onClick : undefined}
      disabled={!conectado}
      whileHover={conectado && !reduzir ? { y: -1 } : undefined}
      whileTap={conectado && !reduzir ? { scale: 0.97 } : undefined}
      aria-pressed={ativo}
      title={conectado ? undefined : copy.channelSelector.disconnectedHint.replace("{canal}", label)}
      className={`inline-flex h-11 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-full px-4 transition-colors ${
        !conectado
          ? "border border-border opacity-50 cursor-not-allowed"
          : ativo
            ? "border-2 border-[#9B30D9] bg-[rgba(155,48,217,.12)]"
            : "border border-border/80 bg-card/40 hover:bg-card/70"
      }`}
    >
      <ChannelLogo canal={tipo} size="sm" variant="logo" />
      <span className="text-sm font-semibold text-foreground">{label}</span>
      {conectado ? (
        <span className="text-xs tabular-nums text-muted-foreground">{total}</span>
      ) : (
        <PlugZap2 size={14} className="text-muted-foreground" />
      )}
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
function MarcaPill({ nome, slug, total, ativo, onClick }: {
  nome: string;
  slug: string;
  total: number;
  ativo: boolean;
  onClick: () => void;
}) {
  const reduzir = useReducedMotion();
  const vazia = total === 0;
  // Uma empresa já selecionada pode zerar depois — quando o canal marcado
  // junto não tem nenhum SKU dela. Ela continua clicável para dar para
  // desmarcar; só quem nunca foi selecionada fica de fato travada em zero.
  const bloqueada = vazia && !ativo;
  // Marca cadastrada no banco pode não ter identidade visual no config; nesse
  // caso a pílula cai no nome em texto em vez de quebrar por logo faltando.
  const temIdentidade = isBrandSlug(slug);

  return (
    <motion.button
      type="button"
      onClick={bloqueada ? undefined : onClick}
      disabled={bloqueada}
      whileHover={!bloqueada && !reduzir ? { y: -1 } : undefined}
      whileTap={!bloqueada && !reduzir ? { scale: 0.97 } : undefined}
      aria-pressed={ativo}
      aria-label={nome}
      title={bloqueada ? copy.brandSelector.emptyHint.replace("{marca}", nome) : undefined}
      className={`inline-flex h-11 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-full px-4 transition-colors ${
        bloqueada
          ? "border border-border opacity-40 cursor-not-allowed"
          : ativo
            ? "border-2 bg-card/70"
            : "border border-border/80 bg-card/40 hover:bg-card/70"
      }`}
      style={ativo ? { borderColor: brandColor(slug) } : undefined}
    >
      {temIdentidade
        ? <BrandLogo brand={slug} height={17} />
        : <span className="text-sm font-semibold text-foreground">{nome}</span>}
      <span className="text-xs tabular-nums text-muted-foreground">{total}</span>
    </motion.button>
  );
}

export function EstoqueLista() {
  const reduzir = useReducedMotion();
  const [produtos, setProdutos]   = useState<Produto[]>([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [busca, setBusca]         = useState("");
  // Empresa e canal aceitam mais de uma marcada ao mesmo tempo — Set em vez de
  // string, com o mesmo toggle de sempre (clicar na ativa desmarca).
  const [brandIds, setBrandIds]   = useState<ReadonlySet<string>>(new Set());
  const [canaisSelecionados, setCanaisSelecionados] = useState<ReadonlySet<CanalVenda>>(new Set());
  const [canais, setCanais]       = useState<Awaited<ReturnType<typeof actionContarProdutosPorCanal>>>([]);
  const [filtro, setFiltro]       = useState<Filtro>("todos");
  const [canManage, setCanManage] = useState(false);
  const requestId = useRef(0);
  const [, startTransition]       = useTransition();
  const [canalProduto, setCanalProduto] = useState<{ id: string; nome: string } | null>(null);
  const [marcas, setMarcas] = useState<Awaited<ReturnType<typeof actionContarProdutosPorMarca>>>([]);
  const [sincronizando, setSincronizando] = useState(false);
  const [indicadores, setIndicadores] = useState<Indicadores | null>(null);
  const [parados, setParados] = useState<Map<string, ProdutoParado>>(new Map());
  const [selecionados, setSelecionados] = useState<ReadonlySet<string>>(new Set());
  const [minimoLote, setMinimoLote] = useState("");
  const [aplicandoLote, setAplicandoLote] = useState(false);

  // Set muda de referência a cada toggle — para os efeitos abaixo não
  // dispararem em loop comparando array por identidade, a dependência real é
  // uma chave estável (mesmo padrão de serialização usado no wizard de régua).
  const brandIdsArray = [...brandIds];
  const canaisArray = [...canaisSelecionados];
  const brandIdsKey = brandIdsArray.slice().sort().join(",");
  const canaisKey = canaisArray.slice().sort().join(",");

  // As contagens das duas barras se cruzam: cada uma é recontada com o filtro
  // da outra aplicado, então a pílula nunca promete um número que a lista não
  // vai entregar.
  useEffect(() => {
    actionContarProdutosPorMarca(canaisArray.length ? canaisArray : undefined).then(setMarcas).catch(() => setMarcas([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canaisKey]);

  useEffect(() => {
    actionContarProdutosPorCanal(brandIdsArray.length ? brandIdsArray : undefined).then(setCanais).catch(() => setCanais([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandIdsKey]);

  /* Aquecimento em segundo plano — a tela abre sem escopo, então o tempo em que
     a pessoa lê o convite e decide a empresa é tempo livre para já buscar os
     produtos. Quando ela clica, a lista pinta do cache e a busca real roda
     atrás para confirmar. Uma requisição por empresa, sem canal: é o clique
     que a tela espera. */
  const cacheEscopo = useRef(new Map<string, { data: Produto[]; total: number; canManage: boolean }>());
  const [aquecidas, setAquecidas] = useState(0);

  useEffect(() => {
    if (marcas.length === 0) return;
    let cancelado = false;
    // Inclui marca vazia de propósito: a consulta sai vazia e barata, e é por
    // ela que a tela limpa descobre a permissão — sem isso, um catálogo ainda
    // sem produto nenhum esconderia o botão de sincronizar.
    const pendentes = marcas.filter((marca) => !cacheEscopo.current.has(marca.brandId));
    if (pendentes.length === 0) return;

    (async () => {
      for (const marca of pendentes) {
        if (cancelado) return;
        try {
          const res = await actionListarProdutos({ brandIds: [marca.brandId] });
          if (cancelado) return;
          cacheEscopo.current.set(marca.brandId, {
            data: res.data as Produto[],
            total: res.total,
            canManage: res.permissions.canManage,
          });
          setCanManage(res.permissions.canManage);
          setAquecidas((n) => n + 1);
        } catch {
          // Aquecimento é oportunista: falhar aqui não é erro visível, o clique
          // busca de novo pelo caminho normal.
        }
      }
    })();

    return () => { cancelado = true; };
  }, [marcas]);

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
      .then(setIndicadores)
      .catch(() => {
        setIndicadores(null);
        toast.error("Não foi possível verificar o catálogo. Tente atualizar a página.", { id: "estoque-indicadores" });
      });
  }, []);

  const carregar = useCallback((marcas?: string[], termo?: string, estado?: Filtro, canaisAtuais?: string[]) => {
    const currentRequest = ++requestId.current;
    // Pinta na hora com o que o aquecimento já trouxe, quando o escopo é
    // exatamente "só esta empresa" — a busca abaixo continua e substitui. Com
    // duas ou mais empresas marcadas o cache não cobre a combinação, então
    // segue direto para a busca real.
    const aquecido = marcas?.length === 1 && !termo && !canaisAtuais?.length && (!estado || estado === "todos")
      ? cacheEscopo.current.get(marcas[0])
      : undefined;
    if (aquecido) {
      setProdutos(aquecido.data);
      setTotal(aquecido.total);
      setCanManage(aquecido.canManage);
      setSelecionados(new Set());
    }
    startTransition(async () => {
      setLoading(!aquecido);
      try {
        const res = await actionListarProdutos({
          brandIds: marcas?.length ? marcas : undefined,
          busca: termo || undefined,
          estado: estado && estado !== "todos" ? estado : undefined,
          canalTipos: canaisAtuais?.length ? canaisAtuais : undefined,
        });
        if (currentRequest !== requestId.current) return;
        setProdutos(res.data as Produto[]);
        setTotal(res.total);
        setCanManage(res.permissions.canManage);
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

     Sem escopo não há o que carregar: a tela mostra o convite e o aquecimento
     cuida do resto. O que sobrou de uma seleção anterior fica em memória sem
     ser renderizado, então voltar para a empresa é instantâneo. */
  const escopoDefinido = brandIds.size > 0 || busca.trim() !== "";
  const aquecimentoCompleto = marcas.length > 0 && aquecidas >= marcas.length;

  useEffect(() => {
    if (!escopoDefinido) return;
    const timer = setTimeout(() => carregar(brandIdsArray, busca, filtro, canaisArray), busca ? 300 : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandIdsKey, busca, filtro, canaisKey, carregar, escopoDefinido]);

  useEffect(() => {
    carregarIndicadores(brandIdsArray, canaisArray);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandIdsKey, canaisKey, carregarIndicadores]);

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

  async function sincronizar() {
    setSincronizando(true);
    try {
      const resultado = await actionImportarCatalogoEstoque();
      if (resultado.produtosCriados > 0) {
        toast.success(copy.syncSuccess.replace("{criados}", String(resultado.produtosCriados)));
        carregar(brandIdsArray, busca, filtro, canaisArray);
        carregarIndicadores(brandIdsArray, canaisArray);
        actionContarProdutosPorCanal(brandIdsArray.length ? brandIdsArray : undefined).then(setCanais).catch(() => {});
      } else {
        toast.info(copy.syncNothingNew);
      }
    } catch {
      toast.error(copy.syncError);
    } finally {
      setSincronizando(false);
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
    setBrandIds((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(brandId)) proximo.delete(brandId);
      else proximo.add(brandId);
      return proximo;
    });
  }

  function alternarCanal(tipo: CanalVenda) {
    setCanaisSelecionados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(tipo)) proximo.delete(tipo);
      else proximo.add(tipo);
      return proximo;
    });
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
      {canManage && (
        // Sincronizar é a única forma de produto entrar no catálogo: tudo
        // aqui existe porque existe no Mercado Livre — nunca o contrário.
        // Legenda ao lado: com Editar/Canal virando ícone puro na linha da
        // tabela, algo precisa dizer o que cada um faz sem exigir passar o
        // mouse em cada um — aparece uma vez, no topo, não repetida ao lado
        // de cada produto. "Movimento" saiu daqui: estoque não tem mais
        // ajuste manual, só o que os canais informam.
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 rounded-full border border-border/60 bg-card px-3.5 py-2 shadow-[0_2px_10px_rgba(14,15,19,.04)]">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Ícones
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Pencil size={13} strokeWidth={2} /> Editar
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Link2 size={13} strokeWidth={2} /> Vincular canal
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/estoque/alertas"
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-[0.75rem] px-4 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(227,19,27,.28)]"
              style={{ background: "var(--gradient-signature)" }}
            >
              <SlidersHorizontal size={15} strokeWidth={2} />
              {copy.health.setupAction}
            </Link>
            <motion.button
              whileHover={reduzir ? undefined : { scale: 1.02 }}
              whileTap={reduzir ? undefined : { scale: 0.98 }}
              onClick={sincronizar}
              disabled={sincronizando}
              className="h-11 pl-3 pr-4 inline-flex items-center gap-2.5 rounded-[0.75rem] border border-border bg-card text-sm font-semibold text-foreground shadow-[0_2px_10px_rgba(14,15,19,.05)] transition-colors hover:bg-muted disabled:opacity-60"
            >
              <span aria-hidden="true">
                {sincronizando
                  ? <RefreshCw size={15} className="animate-spin" />
                  : <ChannelLogo canal="mercadolivre" size="xs" variant="logo" />}
              </span>
              {sincronizando ? copy.syncingAction : copy.syncAction}
            </motion.button>
          </div>
        </div>
      )}

      <FaixaSaude
        indicadores={indicadores}
        filtro={filtro}
        onFiltro={trocarFiltro}
      />

      {/* Barra de escopo — as duas perguntas lado a lado: de quem é o estoque
          e em que canal ele está anunciado. Empresa vem primeiro porque é a
          que define o que a tela mostra; canal só estreita. Centralizada e
          com identidade própria (ícone + rótulo por seção), mesmo tratamento
          usado em Clientes — o convite é visual, não escrito. */}
      <div className="mb-5 flex justify-center">
        <div className="w-full max-w-4xl rounded-[1.75rem] border border-border/60 bg-card px-8 py-7 shadow-[0_4px_24px_rgba(14,15,19,.06)] sm:px-10">
          <div className="flex flex-col items-center gap-7 lg:flex-row lg:justify-center lg:gap-10">
            <div data-tour="estoque-empresa" className="flex min-w-0 flex-col items-center">
              <div className="flex flex-nowrap justify-center gap-2.5">
                {marcas.map((marca) => (
                  <MarcaPill
                    key={marca.brandId}
                    nome={marca.name}
                    slug={marca.slug}
                    total={marca.total}
                    ativo={brandIds.has(marca.brandId)}
                    onClick={() => alternarMarca(marca.brandId)}
                  />
                ))}
              </div>
            </div>

            <div
              aria-hidden="true"
              className="hidden h-16 w-px shrink-0 lg:block"
              style={{ background: "linear-gradient(to bottom, transparent, var(--border), transparent)" }}
            />
            <div aria-hidden="true" className="h-px w-28 lg:hidden" style={{ background: "linear-gradient(to right, transparent, var(--border), transparent)" }} />

            <div className="flex min-w-0 flex-col items-center">
              <div className="flex flex-nowrap justify-center gap-2.5">
                {canais.map((item) => (
                  <CanalPill
                    key={item.tipo}
                    tipo={item.tipo}
                    total={item.total}
                    conectado={item.conectado}
                    ativo={canaisSelecionados.has(item.tipo)}
                    onClick={() => alternarCanal(item.tipo)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-4 rounded-[1.25rem] bg-card p-2 shadow-[0_2px_16px_rgba(14,15,19,.07)]">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder={copy.searchPlaceholder}
            className="min-h-11 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-sm focus:outline-none focus:border-[rgba(155,48,217,.5)] focus:shadow-[0_0_0_3px_rgba(155,48,217,.08)] transition-[border-color,box-shadow]"
          />
        </div>
      </div>

      {escopoDefinido && (
        <TrilhoEstado indicadores={indicadores} filtro={filtro} onFiltro={trocarFiltro} />
      )}

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
                  className="min-h-9 inline-flex items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-white disabled:opacity-50"
                  style={{ background: COR.info }}
                >
                  {aplicandoLote && <Loader2 size={13} className="animate-spin" />}
                  {aplicandoLote ? copy.bulk.applying : copy.bulk.apply}
                </button>
                <button
                  type="button"
                  onClick={() => setSelecionados(new Set())}
                  className="min-h-9 px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
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
          className="rounded-[1.25rem] bg-card px-6 py-14 text-center shadow-[0_2px_16px_rgba(14,15,19,.07)]"
        >
          <div className="mx-auto flex max-w-md flex-col items-center gap-4">
            <BrandLogoGroup height={26} className="opacity-90" />
            <p className="text-base font-bold text-foreground" style={{ fontFamily: "var(--font-sora)" }}>
              {copy.escolha.title}
            </p>
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              {aquecimentoCompleto ? (
                <>
                  <Check size={12} strokeWidth={3} style={{ color: COR.ok }} />
                  {copy.escolha.readyHint}
                </>
              ) : (
                <>
                  <Loader2 size={11} className="animate-spin" />
                  {copy.escolha.loadingHint}
                </>
              )}
            </p>
          </div>
        </motion.div>
      ) : (
      <motion.div
        initial={reduzir ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springs.settleFast}
        className="rounded-[1.25rem] bg-card shadow-[0_2px_16px_rgba(14,15,19,.07)] overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-foreground">{copy.sectionTitle}</p>
          {/* Sem key: o total é dado crítico e não deve re-animar a cada
              filtro (PRD §14.5 — "número não dança depois de carregado"). */}
          <span className="rounded-full bg-[#9B30D9]/10 px-2.5 py-1 text-xs font-bold text-[#9B30D9] tabular-nums">
            {total} {total === 1 ? "produto" : "produtos"}
          </span>
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
                action={
                  canManage && !filtrando ? (
                    <motion.button
                      whileHover={reduzir ? undefined : { scale: 1.03 }}
                      whileTap={reduzir ? undefined : { scale: 0.97 }}
                      onClick={sincronizar}
                      disabled={sincronizando}
                      className="h-10 px-5 inline-flex items-center gap-2 rounded-[0.75rem] text-sm font-semibold text-white disabled:opacity-60"
                      style={{ background: "var(--gradient-signature)" }}
                    >
                      <RefreshCw size={15} className={sincronizando ? "animate-spin" : ""} />
                      {sincronizando ? copy.syncingAction : copy.syncAction}
                    </motion.button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <div>
              {/* Mobile: cartão com os campos que decidem — saldo e mínimo */}
              <div className="md:hidden divide-y divide-border" data-testid="estoque-cards">
                {produtos.map((p) => {
                  const saldo = p.saldo ?? 0;
                  const parado = filtro === "parados" ? parados.get(p.id) : undefined;
                  const estado = estadoLinha(saldo, p.estoqueMinimo);
                  const corEstado = CORES_ESTADO[estado];
                  return (
                    <article key={p.id} className="relative p-4 pl-5 space-y-3">
                      <span
                        aria-hidden="true"
                        className="absolute left-0 top-4 bottom-4 w-[3px] rounded-r-sm"
                        style={corEstado
                          ? { background: corEstado }
                          : { background: "repeating-linear-gradient(180deg, var(--border) 0 3px, transparent 3px 6px)" }}
                      />
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground">{p.nome}</p>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1">
                            <span className="font-mono text-[11px] text-muted-foreground bg-muted rounded px-1.5 py-0.5">SKU: {p.sku}</span>
                            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                              Empresa: <span className="font-semibold" style={{ color: brandColor(p.brandSlug) }}>{p.brandName}</span>
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
                              {parado.diasSemVenda} {copy.parados.daysSuffix} · {dinheiro.format(parado.capitalParado)}
                            </p>
                          )}
                        </div>
                        {canManage && (
                          <input
                            type="checkbox"
                            checked={selecionados.has(p.id)}
                            onChange={() => alternarSelecao(p.id)}
                            aria-label={`Selecionar ${p.nome}`}
                            className="mt-1 h-4 w-4 shrink-0 accent-[#9B30D9]"
                          />
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-sm items-end">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">{copy.mobile.balance}</p>
                          <SaldoCelula saldo={saldo} minimo={p.estoqueMinimo} testId={`saldo-${p.sku}`} saldosCanais={p.saldosCanais} />
                        </div>
                        <div data-tour={p === produtos[0] ? "estoque-minimo" : undefined}>
                          <p className="text-xs text-muted-foreground mb-1">{copy.minimum.columnLabel}</p>
                          {canManage
                            ? <MinimoInput produto={p} onSalvo={(valor) => aoSalvarMinimo(p.id, valor)} />
                            : <p className="font-semibold tabular-nums">{p.estoqueMinimo || "—"}</p>}
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
                            className="h-11 w-11 inline-flex items-center justify-center rounded-lg border border-border bg-card text-foreground shadow-[0_1px_2px_rgba(14,15,19,.05)] transition-colors hover:border-[rgba(155,48,217,.4)] hover:bg-muted active:scale-[.97]"
                          >
                            <Eye size={16} strokeWidth={2} />
                          </Link>
                          <button
                            type="button"
                            onClick={() => setCanalProduto({ id: p.id, nome: p.nome })}
                            className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground shadow-[0_1px_2px_rgba(14,15,19,.05)] active:scale-[.97]"
                          >
                            <Link2 size={14} /> {copy.mobile.channels}
                          </button>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>

              <div className="hidden md:block overflow-x-auto" data-testid="estoque-table">
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
                            className="h-4 w-4 accent-[#9B30D9]"
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
                                className="h-4 w-4 accent-[#9B30D9]"
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
                                : <span className="tabular-nums text-muted-foreground">{p.estoqueMinimo || "—"}</span>}
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
                                  className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-border bg-card text-foreground shadow-[0_1px_2px_rgba(14,15,19,.05)] transition-colors hover:border-[rgba(155,48,217,.4)] hover:bg-muted active:scale-[.97]"
                                >
                                  <Eye size={14} strokeWidth={2} />
                                </Link>
                                <button
                                  onClick={() => setCanalProduto({ id: p.id, nome: p.nome })}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-[0_1px_2px_rgba(14,15,19,.05)] transition-colors hover:border-[rgba(155,48,217,.4)] hover:bg-muted hover:text-foreground active:scale-[.97]"
                                  title={copy.channels.mapTitle}
                                  aria-label={copy.channels.mapTitle}
                                >
                                  <Link2 size={14} />
                                </button>
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

      {canalProduto && (
        <CanalModal
          produtoId={canalProduto.id}
          produtoNome={canalProduto.nome}
          onClose={() => setCanalProduto(null)}
        />
      )}

      {/* Tour só depois de haver o que apontar — com a tela ainda em skeleton,
          os alvos não existem e os balões apontariam para o vazio. */}
      {!loading && produtos.length > 0 && (
        <CoachMarks storageKey={copy.coach.storageKey} steps={TOUR} />
      )}
    </div>
  );
}
