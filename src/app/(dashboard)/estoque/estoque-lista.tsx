"use client";

import { useState, useCallback, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Hourglass, Link2, Loader2, PackageX, PlugZap2, RefreshCw, Scale } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { MovimentoModal } from "./movimento-modal";
import { EditarProdutoModal } from "./editar-produto-modal";
import { CanalModal } from "./canal-modal";
import {
  actionListarMarcasEstoque, actionListarProdutos, actionListarProdutosParados,
  actionListarDivergenciasEstoque, actionResolverDivergenciaEstoque, actionImportarCatalogoEstoque,
  actionIndicadoresEstoque, actionDefinirEstoqueMinimoEmLote, actionContarProdutosPorCanal,
} from "./actions";
import { SkeletonRow } from "@/shared/design-system/primitives/Skeleton";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { PageHeader } from "@/shared/design-system/primitives/PageHeader";
import { SectionCard } from "@/shared/design-system/primitives/SectionCard";
import { ChannelLogo } from "@/shared/design-system/primitives/ChannelLogo";
import { springs } from "@/shared/design-system/motion-variants";
import pagesConfig from "@/config/pages.json";
import channelsConfig from "@/config/channels.json";
import { getBrandConfig } from "@/shared/config/brands";

type Produto = {
  id: string; sku: string; nome: string; preco: string; custo?: string | null;
  estoqueMinimo: number; brandId: string; brandName: string; brandSlug: string; saldo?: number;
};

type Filtro = "todos" | "abaixo_minimo" | "sem_estoque" | "parados" | "sem_minimo";
type CanalVenda = "mercadolivre" | "shopee" | "tiktokshop";

type Indicadores = Awaited<ReturnType<typeof actionIndicadoresEstoque>>;
type ProdutoParado = Awaited<ReturnType<typeof actionListarProdutosParados>>[number];
type Divergencia = Awaited<ReturnType<typeof actionListarDivergenciasEstoque>>[number];

const copy = pagesConfig.estoque;
const PAGINA = 50;

const dinheiro = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function brandColor(slug: string) {
  return getBrandConfig(slug)?.color ?? "var(--muted-foreground)";
}

function canalLabel(canal: string) {
  const items = channelsConfig.items as Record<string, { label?: string }>;
  return items[canal]?.label ?? canal;
}

/* ── Cartão de alerta ──────────────────────────────────────────
   Cada indicador é também o filtro dele: o número que assusta é o
   mesmo botão que mostra quais SKUs causaram o susto. */
function AlertCard({ label, valor, sub, icon: Icon, tom, ativo, onClick }: {
  label: string;
  valor: number;
  sub?: string;
  icon: LucideIcon;
  tom: "danger" | "warning" | "neutro";
  ativo: boolean;
  onClick: () => void;
}) {
  const cor = tom === "danger" ? "#C21820" : tom === "warning" ? "#B57A00" : "var(--muted-foreground)";
  const destaque = valor > 0 && tom !== "neutro";

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
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
      <p
        className="text-[26px] font-bold leading-none tabular-nums tracking-[-0.02em]"
        style={{ color: destaque ? cor : "var(--foreground)" }}
      >
        {valor}
      </p>
      {sub && <p className="mt-1.5 text-[11px] text-muted-foreground">{sub}</p>}
    </motion.button>
  );
}

/* ── Divergências ──────────────────────────────────────────────
   Reconciliação noturna (A5) marca, humano decide — a correção nunca
   é automática. Só aparece quando existe algo pendente: painel que
   vive dizendo "nada aqui" só rouba espaço. */
function DivergenciasPanel({ onResolvida }: { onResolvida: () => void }) {
  const dc = copy.divergencias;
  const [divergencias, setDivergencias] = useState<Divergencia[] | null>(null);
  const [resolvendo, setResolvendo] = useState<{ id: string; decisao: "aplicar_canal" | "ignorar" } | null>(null);

  useEffect(() => {
    actionListarDivergenciasEstoque().then(setDivergencias).catch(() => setDivergencias([]));
  }, []);

  async function resolver(id: string, decisao: "aplicar_canal" | "ignorar") {
    setResolvendo({ id, decisao });
    try {
      await actionResolverDivergenciaEstoque(id, decisao);
      toast.success(decisao === "aplicar_canal" ? dc.applySuccess : dc.ignoreSuccess);
      setDivergencias((atual) => atual?.filter((item) => item.id !== id) ?? atual);
      onResolvida();
    } catch {
      toast.error(decisao === "aplicar_canal" ? dc.applyError : dc.ignoreError);
    } finally {
      setResolvendo(null);
    }
  }

  if (divergencias === null || divergencias.length === 0) return null;

  return (
    // O testid fica no wrapper: SectionCard não repassa props extras ao DOM.
    <div data-testid="divergencias-estoque-painel">
    <SectionCard
      title={dc.title}
      description={dc.subtitle}
      icon={Scale}
      className="mb-4"
    >
      <div className="divide-y divide-border -my-2">
        {divergencias.map((item) => {
          const ocupado = resolvendo?.id === item.id;
          return (
            <div key={item.id} className="flex flex-col gap-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-medium text-foreground">{item.produtoNome}</p>
                <p className="font-mono text-xs text-muted-foreground mt-0.5">{item.produtoSku} · {canalLabel(item.canal)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {dc.localLabel}: <span className="font-semibold text-foreground">{item.saldoLocal}</span>
                  {"  ·  "}
                  {dc.channelLabel}: <span className="font-semibold text-foreground">{item.saldoCanal}</span>
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => resolver(item.id, "ignorar")}
                  className="min-h-9 rounded-lg border border-border px-3 text-xs font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50"
                >
                  {resolvendo?.decisao === "ignorar" && ocupado ? <Loader2 size={13} className="animate-spin" /> : dc.ignoreAction}
                </button>
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => resolver(item.id, "aplicar_canal")}
                  className="min-h-9 inline-flex items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-white disabled:opacity-60"
                  style={{ background: "var(--gradient-signature)" }}
                >
                  {resolvendo?.decisao === "aplicar_canal" && ocupado && <Loader2 size={13} className="animate-spin" />}
                  {resolvendo?.decisao === "aplicar_canal" && ocupado ? dc.applyingAction : dc.applyAction}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
    </div>
  );
}

/* ── Campo de mínimo ───────────────────────────────────────────
   Editável na própria linha: é o número que liga o alerta do A6, e
   escondê-lo dentro de um modal por produto inviabiliza um catálogo
   inteiro. Salva ao sair do campo ou no Enter. */
function MinimoInput({ produto, onSalvo }: { produto: Produto; onSalvo: (valor: number) => void }) {
  const [valor, setValor] = useState(String(produto.estoqueMinimo || ""));
  const [salvando, setSalvando] = useState(false);
  const [minimoSincronizado, setMinimoSincronizado] = useState(produto.estoqueMinimo);

  // Ajuste de estado durante o render (padrão recomendado do React para
  // "estado derivado de prop"): quando o lote muda o mínimo por fora, o campo
  // acompanha sem passar por um efeito e um render extra.
  if (minimoSincronizado !== produto.estoqueMinimo) {
    setMinimoSincronizado(produto.estoqueMinimo);
    setValor(String(produto.estoqueMinimo || ""));
  }

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
      toast.success(copy.minimum.saved);
    } catch {
      toast.error(copy.minimum.error);
      setValor(String(produto.estoqueMinimo || ""));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="relative">
      <input
        type="number"
        min="0"
        step="1"
        inputMode="numeric"
        value={valor}
        disabled={salvando}
        placeholder={copy.minimum.placeholder}
        aria-label={`${copy.minimum.columnLabel} — ${produto.nome}`}
        onChange={(event) => setValor(event.target.value)}
        onBlur={salvar}
        onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
        className="h-9 w-[68px] rounded-lg border border-border bg-background px-2 text-sm tabular-nums text-foreground text-right no-spinner focus:outline-none focus:border-[rgba(155,48,217,.5)] focus:shadow-[0_0_0_3px_rgba(155,48,217,.08)] transition-[border-color,box-shadow] disabled:opacity-50"
      />
      {salvando && <Loader2 size={12} className="animate-spin absolute -left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />}
    </div>
  );
}

/* ── Saldo com leitura relativa ────────────────────────────────
   A barra compara saldo × mínimo: dá o veredito antes de a pessoa
   ler o número. Sem mínimo definido não há régua, então não há barra. */
function SaldoCelula({ saldo, minimo, testId }: { saldo: number; minimo: number; testId: string }) {
  const zerado = saldo <= 0;
  const abaixo = !zerado && minimo > 0 && saldo <= minimo;
  const cor = zerado ? "#B57A00" : abaixo ? "#C21820" : "#1F8A4C";
  const proporcao = minimo > 0 ? Math.min(saldo / (minimo * 2), 1) : 1;

  return (
    <div className="w-[72px] ml-auto">
      <p data-testid={testId} className="text-[15px] font-bold tabular-nums leading-none text-right" style={{ color: zerado || abaixo ? cor : "var(--foreground)" }}>
        {saldo}
      </p>
      {minimo > 0 && (
        <div className="mt-1.5 h-[3px] rounded-full bg-muted overflow-hidden">
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: zerado ? 0 : proporcao }}
            transition={springs.settle}
            className="h-full rounded-full origin-left"
            style={{ background: cor, width: "100%" }}
          />
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
  const label = (channelsConfig.items as Record<string, { label?: string }>)[tipo]?.label ?? tipo;

  return (
    <motion.button
      type="button"
      onClick={conectado ? onClick : undefined}
      disabled={!conectado}
      whileHover={conectado ? { y: -1 } : undefined}
      whileTap={conectado ? { scale: 0.97 } : undefined}
      aria-pressed={ativo}
      title={conectado ? undefined : copy.channelSelector.disconnectedHint.replace("{canal}", label)}
      className={`inline-flex h-[38px] items-center gap-2 rounded-full px-3.5 transition-colors ${
        !conectado
          ? "border border-border opacity-50 cursor-not-allowed"
          : ativo
            ? "text-white"
            : "border border-border bg-card hover:bg-muted"
      }`}
      style={ativo && conectado ? { background: "var(--gradient-signature)" } : undefined}
    >
      <ChannelLogo canal={tipo} size="xs" variant="logo" />
      <span className={`text-[13px] font-semibold ${ativo && conectado ? "text-white" : "text-foreground"}`}>
        {label}
      </span>
      {conectado ? (
        <span className={`text-[11px] tabular-nums ${ativo ? "text-white/75" : "text-muted-foreground"}`}>
          {total}
        </span>
      ) : (
        <PlugZap2 size={13} className="text-muted-foreground" />
      )}
    </motion.button>
  );
}

export function EstoqueLista() {
  const router = useRouter();
  const [produtos, setProdutos]   = useState<Produto[]>([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [busca, setBusca]         = useState("");
  const [brandId, setBrandId]     = useState("");
  const [canal, setCanal]         = useState<CanalVenda | "">("");
  const [canais, setCanais]       = useState<Awaited<ReturnType<typeof actionContarProdutosPorCanal>>>([]);
  const [filtro, setFiltro]       = useState<Filtro>("todos");
  const [canManage, setCanManage] = useState(false);
  const requestId = useRef(0);
  const [, startTransition]       = useTransition();
  const [canalProduto, setCanalProduto] = useState<{ id: string; nome: string } | null>(null);
  const [marcas, setMarcas] = useState<Awaited<ReturnType<typeof actionListarMarcasEstoque>>>([]);
  const [sincronizando, setSincronizando] = useState(false);
  const [indicadores, setIndicadores] = useState<Indicadores | null>(null);
  const [parados, setParados] = useState<Map<string, ProdutoParado>>(new Map());
  const [selecionados, setSelecionados] = useState<ReadonlySet<string>>(new Set());
  const [minimoLote, setMinimoLote] = useState("");
  const [aplicandoLote, setAplicandoLote] = useState(false);

  useEffect(() => {
    actionListarMarcasEstoque().then(setMarcas).catch(() => setMarcas([]));
    actionContarProdutosPorCanal().then(setCanais).catch(() => setCanais([]));
  }, []);

  const carregarIndicadores = useCallback((marca?: string, canalAtual?: string) => {
    actionIndicadoresEstoque(marca || undefined, canalAtual || undefined)
      .then(setIndicadores)
      .catch(() => setIndicadores(null));
  }, []);

  const carregar = useCallback((marca?: string, termo?: string, estado?: Filtro, canalAtual?: string) => {
    const currentRequest = ++requestId.current;
    startTransition(async () => {
      setLoading(true);
      try {
        const res = await actionListarProdutos({
          brandId: marca || undefined,
          busca: termo || undefined,
          estado: estado && estado !== "todos" ? estado : undefined,
          canalTipo: canalAtual || undefined,
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

  useEffect(() => {
    const timer = setTimeout(() => carregar(brandId, busca, filtro, canal), busca ? 300 : 0);
    return () => clearTimeout(timer);
  }, [brandId, busca, filtro, canal, carregar]);

  useEffect(() => { carregarIndicadores(brandId, canal); }, [brandId, canal, carregarIndicadores]);

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
        brandId: brandId || undefined,
        busca: busca || undefined,
        estado: filtro !== "todos" ? filtro : undefined,
        canalTipo: canal || undefined,
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
        carregar(brandId, busca, filtro, canal);
        carregarIndicadores(brandId, canal);
        actionContarProdutosPorCanal().then(setCanais).catch(() => {});
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
      carregarIndicadores(brandId, canal);
    } catch {
      toast.error(copy.bulk.error);
    } finally {
      setAplicandoLote(false);
    }
  }

  function aoSalvarMinimo(produtoId: string, valor: number) {
    setProdutos((atual) => atual.map((p) => p.id === produtoId ? { ...p, estoqueMinimo: valor } : p));
    carregarIndicadores(brandId, canal);
  }

  function trocarFiltro(proximo: Filtro) {
    setFiltro((atual) => atual === proximo ? "todos" : proximo);
  }

  const chips: Array<{ id: Filtro; label: string; contagem?: number }> = [
    { id: "todos", label: copy.filters.all, contagem: indicadores?.total },
    { id: "abaixo_minimo", label: copy.filters.belowMin, contagem: indicadores?.abaixoMinimo },
    { id: "sem_estoque", label: copy.filters.outOfStock, contagem: indicadores?.semEstoque },
    { id: "parados", label: copy.filters.stalled, contagem: indicadores?.parados },
    { id: "sem_minimo", label: copy.filters.noMin, contagem: indicadores?.semMinimo },
  ];

  const filtrando = filtro !== "todos" || busca.trim() !== "" || brandId !== "" || canal !== "";

  return (
    <div>
      <PageHeader
        title={copy.title}
        description={copy.description}
        actions={canManage ? (
          <>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={sincronizar}
              disabled={sincronizando}
              className="h-10 px-4 inline-flex items-center gap-2 rounded-[0.75rem] border border-border text-sm font-semibold text-foreground hover:bg-muted transition-colors disabled:opacity-60"
            >
              <RefreshCw size={15} className={sincronizando ? "animate-spin" : ""} />
              {sincronizando ? copy.syncingAction : copy.syncAction}
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => router.push("/estoque/novo")}
              className="h-10 px-4 rounded-[0.75rem] text-sm font-semibold text-white shadow-[0_4px_14px_rgba(227,19,27,.3)]"
              style={{ background: "var(--gradient-signature)" }}
            >
              {copy.newAction}
            </motion.button>
          </>
        ) : undefined}
      />

      {/* Faixa de alertas — os números do PRD (mínimo atingido, encalhe,
          divergência) deixam de ser link escondido e viram ponto de partida. */}
      <div className="grid gap-3 mb-5 grid-cols-2 lg:grid-cols-4">
        <AlertCard
          label={copy.indicators.belowMin}
          valor={indicadores?.abaixoMinimo ?? 0}
          icon={AlertTriangle}
          tom="danger"
          ativo={filtro === "abaixo_minimo"}
          onClick={() => trocarFiltro("abaixo_minimo")}
        />
        <AlertCard
          label={copy.indicators.outOfStock}
          valor={indicadores?.semEstoque ?? 0}
          icon={PackageX}
          tom="warning"
          ativo={filtro === "sem_estoque"}
          onClick={() => trocarFiltro("sem_estoque")}
        />
        <AlertCard
          label={copy.indicators.stalled}
          valor={indicadores?.parados ?? 0}
          sub={indicadores && indicadores.capitalParado > 0
            ? `${dinheiro.format(indicadores.capitalParado)} ${copy.indicators.capitalPrefix}`
            : undefined}
          icon={Hourglass}
          tom="neutro"
          ativo={filtro === "parados"}
          onClick={() => trocarFiltro("parados")}
        />
        <AlertCard
          label={copy.indicators.divergences}
          valor={indicadores?.divergencias ?? 0}
          icon={Scale}
          tom="neutro"
          ativo={false}
          onClick={() => document.querySelector("[data-testid=divergencias-estoque-painel]")?.scrollIntoView({ behavior: "smooth", block: "center" })}
        />
      </div>

      {canManage && <DivergenciasPanel onResolvida={() => carregarIndicadores(brandId, canal)} />}

      <div className="mb-4">
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">{copy.channelSelector.label}</p>
        <div className="flex flex-wrap gap-2">
          {canais.map((item) => (
            <CanalPill
              key={item.tipo}
              tipo={item.tipo}
              total={item.total}
              conectado={item.conectado}
              ativo={canal === item.tipo}
              onClick={() => setCanal((atual) => atual === item.tipo ? "" : item.tipo)}
            />
          ))}
        </div>
        {canais.some((item) => !item.conectado) && (
          <p className="mt-1.5 text-[11px] text-muted-foreground">{copy.channelSelector.disconnectedFootnote}</p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px] mb-3">
        <input
          value={busca}
          onChange={(event) => setBusca(event.target.value)}
          placeholder={copy.searchPlaceholder}
          className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:border-[rgba(155,48,217,.5)] focus:shadow-[0_0_0_3px_rgba(155,48,217,.08)] transition-[border-color,box-shadow]"
        />
        <select
          value={brandId}
          onChange={(event) => setBrandId(event.target.value)}
          className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm"
        >
          <option value="">{copy.allBrands}</option>
          {marcas.map((marca) => <option key={marca.id} value={marca.id}>{marca.name}</option>)}
        </select>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {chips.map((chip) => {
          const ativo = filtro === chip.id;
          return (
            <motion.button
              key={chip.id}
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={() => setFiltro(chip.id)}
              aria-pressed={ativo}
              className={`min-h-9 rounded-full px-3.5 text-xs font-semibold transition-colors ${
                ativo
                  ? "text-white"
                  : "border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              style={ativo ? { background: "var(--gradient-signature)" } : undefined}
            >
              {chip.label}
              {chip.contagem !== undefined && (
                <span className="ml-1.5 tabular-nums opacity-70">{chip.contagem}</span>
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Barra de ação em massa — é o que torna um catálogo de centenas de
          SKUs configurável: define o mínimo de todos os selecionados de uma vez. */}
      <AnimatePresence>
        {canManage && selecionados.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -6, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -6, height: 0 }}
            transition={springs.settleFast}
            className="mb-3 overflow-hidden"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1rem] border border-[rgba(37,99,235,.25)] bg-[rgba(37,99,235,.06)] px-4 py-3">
              <span className="text-sm font-semibold text-[#2563EB]">
                {selecionados.size === 1
                  ? copy.bulk.selectedSingular
                  : copy.bulk.selectedPlural.replace("{n}", String(selecionados.size))}
              </span>
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-[#2563EB]">{copy.bulk.setMinimum}</label>
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
                  style={{ background: "var(--gradient-signature)" }}
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

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springs.settleFast}
        className="rounded-[1.25rem] bg-card shadow-[0_2px_16px_rgba(14,15,19,.07)] overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-foreground">{copy.sectionTitle}</p>
          {/* Contador em pílula com a fórmula de chip do PRD (fundo 10% +
              texto 100% do tom) — é um dado, não legenda: merece peso. */}
          <motion.span
            key={total}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={springs.settleFast}
            className="rounded-full bg-[#9B30D9]/10 px-2.5 py-1 text-xs font-bold text-[#9B30D9] tabular-nums"
          >
            {total} {total === 1 ? "produto" : "produtos"}
          </motion.span>
        </div>

        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div key="loading" exit={{ opacity: 0 }}>
              {[...Array(5)].map((_, i) => <SkeletonRow key={i} />)}
            </motion.div>
          ) : produtos.length === 0 ? (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <EmptyState
                illustration={filtrando ? "slowMoving" : "restock"}
                title={filtrando ? copy.emptyFiltered.title : copy.empty.title}
                description={filtrando ? copy.emptyFiltered.description : copy.empty.description}
                action={
                  canManage && !filtrando ? (
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <motion.button
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={sincronizar}
                        disabled={sincronizando}
                        className="h-10 px-5 inline-flex items-center gap-2 rounded-[0.75rem] border border-border text-sm font-semibold text-foreground hover:bg-muted transition-colors disabled:opacity-60"
                      >
                        <RefreshCw size={15} className={sincronizando ? "animate-spin" : ""} />
                        {sincronizando ? copy.syncingAction : copy.syncAction}
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => router.push("/estoque/novo")}
                        className="h-10 px-5 rounded-[0.75rem] text-sm font-semibold text-white"
                        style={{ background: "var(--gradient-signature)" }}
                      >
                        {copy.newAction}
                      </motion.button>
                    </div>
                  ) : undefined
                }
              />
            </motion.div>
          ) : (
            <motion.div key="lista" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {/* Mobile: cartão com os campos que decidem — saldo e mínimo */}
              <div className="md:hidden divide-y divide-border" data-testid="estoque-cards">
                {produtos.map((p) => {
                  const saldo = p.saldo ?? 0;
                  const parado = filtro === "parados" ? parados.get(p.id) : undefined;
                  return (
                    <article key={p.id} className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground">{p.nome}</p>
                          <p className="mt-1 font-mono text-xs text-muted-foreground">
                            {p.sku} · <span style={{ color: brandColor(p.brandSlug) }}>{p.brandName}</span>
                          </p>
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
                          <SaldoCelula saldo={saldo} minimo={p.estoqueMinimo} testId={`saldo-${p.sku}`} />
                        </div>
                        <div>
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
                          <EditarProdutoModal produtoId={p.id} produtoNome={p.nome} preco={p.preco} custo={p.custo} onSuccess={() => carregar(brandId, busca, filtro, canal)} />
                          <button
                            type="button"
                            onClick={() => setCanalProduto({ id: p.id, nome: p.nome })}
                            className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground shadow-[0_1px_2px_rgba(14,15,19,.05)] active:scale-[.97]"
                          >
                            <Link2 size={14} /> {copy.mobile.channels}
                          </button>
                          <MovimentoModal produtoId={p.id} produtoNome={p.nome} saldoAtual={saldo} onSuccess={() => { carregar(brandId, busca, filtro, canal); carregarIndicadores(brandId, canal); }} />
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
                      return (
                        <motion.tr
                          key={p.id}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: Math.min(i, 12) * 0.02, duration: 0.2, ease: [0, 0, 0.2, 1] }}
                          className={`border-b border-border last:border-0 transition-colors ${selecionado ? "bg-[rgba(37,99,235,.05)]" : "hover:bg-muted/40"}`}
                        >
                          {canManage && (
                            <td className="px-5 py-3.5">
                              <input
                                type="checkbox"
                                checked={selecionado}
                                onChange={() => alternarSelecao(p.id)}
                                aria-label={`Selecionar ${p.nome}`}
                                className="h-4 w-4 accent-[#9B30D9]"
                              />
                            </td>
                          )}
                          <td className="px-5 py-3.5">
                            <p className="font-medium text-foreground">{p.nome}</p>
                            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                              {p.sku} · <span style={{ color: brandColor(p.brandSlug) }}>{p.brandName}</span>
                            </p>
                            {parado && (
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                {parado.diasSemVenda} {copy.parados.daysSuffix} · {dinheiro.format(parado.capitalParado)} {copy.indicators.capitalPrefix}
                              </p>
                            )}
                          </td>
                          <td className="px-5 py-3.5">
                            <SaldoCelula saldo={saldo} minimo={p.estoqueMinimo} testId={`saldo-${p.sku}`} />
                          </td>
                          <td className="px-5 py-3.5">
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
                                <EditarProdutoModal
                                  produtoId={p.id}
                                  produtoNome={p.nome}
                                  preco={p.preco}
                                  custo={p.custo}
                                  onSuccess={() => carregar(brandId, busca, filtro, canal)}
                                />
                                <button
                                  onClick={() => setCanalProduto({ id: p.id, nome: p.nome })}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-[0_1px_2px_rgba(14,15,19,.05)] transition-colors hover:border-[rgba(155,48,217,.4)] hover:bg-muted hover:text-foreground active:scale-[.97]"
                                  title={copy.channels.mapTitle}
                                  aria-label={copy.channels.mapTitle}
                                >
                                  <Link2 size={14} />
                                </button>
                                <MovimentoModal
                                  produtoId={p.id}
                                  produtoNome={p.nome}
                                  saldoAtual={saldo}
                                  onSuccess={() => { carregar(brandId, busca, filtro, canal); carregarIndicadores(brandId, canal); }}
                                />
                              </div>
                            )}
                          </td>
                        </motion.tr>
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
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
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
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {canalProduto && (
        <CanalModal
          produtoId={canalProduto.id}
          produtoNome={canalProduto.nome}
          onClose={() => setCanalProduto(null)}
        />
      )}
    </div>
  );
}
