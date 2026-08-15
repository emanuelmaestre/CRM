"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Loader2, ChevronDown, Search, FileText, ShoppingBag, CircleDollarSign, ReceiptText, Ban } from "lucide-react";
import {
  actionListarPedidosDetalhados, actionListarPedidosParaPdf, actionContarPedidosPorMarca, actionContarPedidosPorCanal,
} from "../actions";
import { SkeletonRow } from "@/shared/design-system/primitives/Skeleton";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { ChannelLogo } from "@/shared/design-system/primitives/ChannelLogo";
import { BrandLogo } from "@/shared/design-system/primitives/BrandLogo";
import { BrandLogoGroup } from "@/shared/design-system/primitives/BrandLogoGroup";
import { CalendarioPopover } from "@/shared/design-system/primitives/CalendarioPopover";
import { escalonamento, fadeUp, springs, variantes } from "@/shared/design-system/motion-variants";
import pagesConfig from "@/config/pages.json";
import channelsConfig from "@/config/channels.json";
import { getBrandConfig, isBrandSlug } from "@/shared/config/brands";
import { exportarPedidosPdf } from "./exportar-pdf";

type CanalVenda = "mercadolivre" | "shopee" | "tiktokshop";
type Pedido = Awaited<ReturnType<typeof actionListarPedidosDetalhados>>["data"][number];
type Marca = Awaited<ReturnType<typeof actionContarPedidosPorMarca>>[number];
type Canal = Awaited<ReturnType<typeof actionContarPedidosPorCanal>>[number];
type Resumo = Awaited<ReturnType<typeof actionListarPedidosDetalhados>>["resumo"];

const copy = pagesConfig.pedidos;
const PAGINA = 50;

const dinheiro = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
const resumoInicial: Resumo = { totalPedidos: 0, faturamento: 0, ticketMedio: 0, cancelados: 0, freteTotal: 0, descontosTotal: 0 };

function inicioDoDia(data: string): string | undefined {
  return data ? `${data}T00:00:00-03:00` : undefined;
}

function fimDoDia(data: string): string | undefined {
  return data ? `${data}T23:59:59.999-03:00` : undefined;
}

const CORES_STATUS: Record<string, string> = {
  criado: "var(--muted-foreground)",
  pago: "var(--info)",
  separado: "var(--info)",
  enviado: "var(--warning)",
  entregue: "var(--success)",
  avaliacao_solicitada: "var(--success)",
  concluido: "var(--success)",
  cancelado: "var(--destructive)",
  devolvido: "var(--destructive)",
};

function statusLabel(status: string) {
  return (pagesConfig.pedidos.statusLabels as Record<string, string>)[status] ?? status;
}

function brandColor(slug: string) {
  return getBrandConfig(slug)?.color ?? "var(--muted-foreground)";
}

function canalLabel(canal: string) {
  const items = channelsConfig.items as Record<string, { label?: string }>;
  return items[canal]?.label ?? canal;
}

/* ── Pílula de marca/canal ──────────────────────────────────────
   Mesmo padrão compacto usado em Inbox/Estoque: uma barra só, marca e canal
   lado a lado, ao contrário do card duplo empilhado que existia antes — pra
   ocupar menos altura de tela sem perder a separação visual das duas
   perguntas (uma linha vertical entre os grupos já basta). */
function MarcaPill({ marca, ativo, onClick }: { marca: Marca; ativo: boolean; onClick: () => void }) {
  const reduzir = useReducedMotion();
  const { slug } = marca;
  const vazia = marca.total === 0;
  const bloqueada = vazia && !ativo;
  const temIdentidade = isBrandSlug(slug);

  return (
    <motion.button
      type="button"
      onClick={bloqueada ? undefined : onClick}
      disabled={bloqueada}
      whileHover={!bloqueada && !reduzir ? { y: -1 } : undefined}
      whileTap={!bloqueada && !reduzir ? { scale: 0.97 } : undefined}
      aria-pressed={ativo}
      aria-label={marca.nome}
      title={bloqueada ? copy.brandSelector.emptyHint.replace("{marca}", marca.nome) : undefined}
      className={`inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3.5 transition-colors ${
        bloqueada
          ? "border border-border opacity-40 cursor-not-allowed"
          : ativo
            ? "border-2 bg-card/70"
            : "border border-border/80 bg-card/40 hover:bg-card/70"
      }`}
      style={ativo ? { borderColor: brandColor(slug) } : undefined}
    >
      {temIdentidade
        ? <BrandLogo brand={slug} height={13} />
        : <span className="text-[13px] font-semibold text-foreground">{marca.nome}</span>}
      <span className="text-[11px] tabular-nums text-muted-foreground">{marca.total}</span>
    </motion.button>
  );
}

function CanalPill({ canal, ativo, onClick }: { canal: Canal; ativo: boolean; onClick: () => void }) {
  const reduzir = useReducedMotion();
  const label = canalLabel(canal.tipo);

  return (
    <motion.button
      type="button"
      onClick={canal.conectado ? onClick : undefined}
      disabled={!canal.conectado}
      whileHover={canal.conectado && !reduzir ? { y: -1 } : undefined}
      whileTap={canal.conectado && !reduzir ? { scale: 0.97 } : undefined}
      aria-pressed={ativo}
      aria-label={label}
      title={canal.conectado ? label : copy.channelSelector.disconnectedHint.replace("{canal}", label)}
      className={`inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 transition-colors ${
        !canal.conectado
          ? "border border-border opacity-50 cursor-not-allowed"
          : ativo
            ? "border-2 border-selecionado bg-selecionado/07"
            : "border border-border/80 bg-card/40 hover:bg-card/70"
      }`}
    >
      <ChannelLogo canal={canal.tipo} size="xs" variant="logo" />
      <span className="text-[11px] tabular-nums text-muted-foreground">{canal.total}</span>
    </motion.button>
  );
}

/* ── Linha expansível ─────────────────────────────────────────────
   Fechada mostra só o essencial pra escanear rápido (pedido, cliente, status,
   total); marca, canal e data só aparecem ao abrir. O pedido inteiro já está
   em memória desde o carregamento da lista — abrir não busca nada no
   servidor, só revela o que já veio, então é instantâneo. */
function LinhaPedido({ item, aberta, onAlternar }: { item: Pedido; aberta: boolean; onAlternar: () => void }) {
  const reduzir = useReducedMotion();
  return (
    <>
      <tr
        onClick={onAlternar}
        aria-expanded={aberta}
        className="cursor-pointer hover:bg-muted/30 transition-colors"
      >
        <td className="px-4 py-3 font-semibold">
          <span className="inline-flex items-center gap-1.5">
            <motion.span
              animate={{ rotate: aberta ? 90 : 0 }}
              transition={reduzir ? { duration: 0 } : springs.settleFast}
              className="text-muted-foreground"
            >
              <ChevronDown size={13} className="-rotate-90" />
            </motion.span>
            #{item.providerOrderId ?? item.id.slice(0, 8)}
          </span>
        </td>
        <td className="px-4 py-3">{item.clienteNome}</td>
        <td className="px-4 py-3 tabular-nums text-muted-foreground">{dataHora.format(new Date(item.createdAt))}</td>
        <td className="px-4 py-3">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
            style={{
              background: `color-mix(in srgb, ${CORES_STATUS[item.status] ?? "var(--muted-foreground)"} 10%, transparent)`,
              color: CORES_STATUS[item.status] ?? "var(--muted-foreground)",
            }}
          >
            {statusLabel(item.status)}
          </span>
        </td>
        <td className="px-4 py-3 tabular-nums">{dinheiro.format(Number(item.total))}</td>
      </tr>
      <AnimatePresence initial={false}>
        {aberta && (
          <motion.tr
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <td colSpan={5} className="bg-muted/20 px-4 pb-4 pt-0">
              <motion.div
                initial={reduzir ? false : { height: 0 }}
                animate={{ height: "auto" }}
                exit={{ height: 0 }}
                transition={springs.settleFast}
                className="overflow-hidden"
              >
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-1 text-xs text-muted-foreground">
                  <span>
                    Empresa: <span className="font-semibold" style={{ color: brandColor(item.brandSlug) }}>{item.brandNome}</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    Canal: <ChannelLogo canal={item.canal} size="xs" variant="logo" /> {canalLabel(item.canal)}
                  </span>
                  <Link href={`/vendas/pedidos/${item.id}`} className="font-semibold text-selecionado hover:underline">
                    Ver detalhe completo →
                  </Link>
                </div>
              </motion.div>
            </td>
          </motion.tr>
        )}
      </AnimatePresence>
    </>
  );
}

export function PedidosLista() {
  const reduzir = useReducedMotion();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [total, setTotal] = useState(0);
  const [resumo, setResumo] = useState<Resumo>(resumoInicial);
  const [loading, setLoading] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [brandIds, setBrandIds] = useState<string[]>([]);
  const [canal, setCanal] = useState<CanalVenda | "">("");
  const [status, setStatus] = useState("");
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [dataInicial, setDataInicial] = useState("");
  const [dataFinal, setDataFinal] = useState("");
  const [exportando, setExportando] = useState(false);
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [canais, setCanais] = useState<Canal[]>([]);
  const [expandido, setExpandido] = useState<string | null>(null);
  const requestId = useRef(0);
  const [, startTransition] = useTransition();

  useEffect(() => {
    actionContarPedidosPorMarca(canal || undefined).then(setMarcas).catch(() => setMarcas([]));
  }, [canal]);

  useEffect(() => {
    actionContarPedidosPorCanal(brandIds.length ? brandIds : undefined).then(setCanais).catch(() => setCanais([]));
  }, [brandIds]);

  useEffect(() => {
    const task = window.setTimeout(() => setBuscaAplicada(busca.trim()), 350);
    return () => window.clearTimeout(task);
  }, [busca]);

  const carregar = useCallback((marcas?: string[], canalAtual?: string, statusAtual?: string, buscaAtual?: string, inicio?: string, fim?: string) => {
    const currentRequest = ++requestId.current;
    startTransition(async () => {
      setLoading(true);
      try {
        const res = await actionListarPedidosDetalhados({
          brandIds: marcas?.length ? marcas : undefined,
          canal: canalAtual || undefined,
          status: statusAtual || undefined,
          busca: buscaAtual || undefined,
          inicio: inicioDoDia(inicio ?? ""),
          fim: fimDoDia(fim ?? ""),
        });
        if (currentRequest !== requestId.current) return;
        setPedidos(res.data);
        setTotal(res.total);
        setResumo(res.resumo);
      } catch {
        if (currentRequest !== requestId.current) return;
        toast.error(copy.loadError);
      } finally {
        if (currentRequest === requestId.current) setLoading(false);
      }
    });
  }, []);

  // Sem marca ou canal escolhidos não há o que carregar: a tela mostra o
  // convite, e as contagens de marca/canal (rápidas) já estão aquecendo por
  // trás para quando a escolha acontecer.
  const escopoDefinido = brandIds.length > 0 || canal !== "";

  useEffect(() => {
    if (!escopoDefinido) return;
    carregar(brandIds, canal, status, buscaAplicada, dataInicial, dataFinal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandIds.join(","), canal, status, buscaAplicada, dataInicial, dataFinal, carregar, escopoDefinido]);

  async function carregarMais() {
    setCarregandoMais(true);
    try {
      const res = await actionListarPedidosDetalhados({
        brandIds: brandIds.length ? brandIds : undefined,
        canal: canal || undefined,
        status: status || undefined,
        busca: buscaAplicada || undefined,
        inicio: inicioDoDia(dataInicial),
        fim: fimDoDia(dataFinal),
        offset: pedidos.length,
      });
      setPedidos((atual) => [...atual, ...res.data]);
      setTotal(res.total);
    } catch {
      toast.error(copy.loadError);
    } finally {
      setCarregandoMais(false);
    }
  }

  const filtrando = brandIds.length > 0 || canal !== "" || status !== "" || buscaAplicada !== "" || dataInicial !== "" || dataFinal !== "";

  async function exportarPdf() {
    if (pedidos.length === 0) return;
    setExportando(true);
    try {
      const relatorio = await actionListarPedidosParaPdf({
        brandIds: brandIds.length ? brandIds : undefined,
        canal: canal || undefined,
        status: status || undefined,
        busca: buscaAplicada || undefined,
        inicio: inicioDoDia(dataInicial),
        fim: fimDoDia(dataFinal),
      });
      await exportarPedidosPdf({ pedidos: relatorio.data, resumo: relatorio.resumo, total: relatorio.total, periodo: { inicio: dataInicial, fim: dataFinal } });
    } catch {
      toast.error("Não foi possível gerar o PDF de vendas.");
    } finally {
      setExportando(false);
    }
  }

  return (
    <div>
      {/* Barra de escopo — empresa e canal na mesma linha, centralizada. */}
      <div className="mb-4 flex flex-wrap items-center justify-center gap-2 w-fit mx-auto">
        {marcas.map((marca) => (
          <MarcaPill
            key={marca.brandId}
            marca={marca}
            ativo={brandIds.includes(marca.brandId)}
            onClick={() => setBrandIds((atual) => atual.includes(marca.brandId)
              ? atual.filter((id) => id !== marca.brandId)
              : [...atual, marca.brandId])}
          />
        ))}

        <span aria-hidden="true" className="h-5 w-px bg-border" />

        {canais.map((item) => (
          <CanalPill
            key={item.tipo}
            canal={item}
            ativo={canal === item.tipo}
            onClick={() => setCanal((atual) => atual === item.tipo ? "" : item.tipo)}
          />
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => setStatus("")}
          aria-pressed={status === ""}
          className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition-colors ${
            status === ""
              ? "border-2 border-selecionado bg-selecionado/07 text-foreground"
              : "border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          {copy.statusFilter.all}
        </button>
        {Object.keys(pagesConfig.pedidos.statusLabels).map((valor) => {
          const ativo = status === valor;
          const cor = CORES_STATUS[valor];
          return (
            <button
              key={valor}
              type="button"
              onClick={() => setStatus((atual) => atual === valor ? "" : valor)}
              aria-pressed={ativo}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition-colors ${
                ativo
                  ? "border-2 border-selecionado bg-selecionado/07 text-foreground"
                  : "border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {cor && <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: cor }} />}
              {statusLabel(valor)}
            </button>
          );
        })}
      </div>

      <div className="mb-4 grid gap-2 rounded-[1.25rem] border border-border bg-card/70 p-3 shadow-[0_2px_12px_rgba(14,15,19,.04)] md:grid-cols-[minmax(240px,1fr)_auto_auto_auto] md:items-center">
        <label className="relative block">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pedido ou cliente…" className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-selecionado" />
        </label>
        <CalendarioPopover rotulo="De:" valor={dataInicial} max={dataFinal || undefined} onChange={setDataInicial} disabled={loading} />
        <CalendarioPopover rotulo="Até:" valor={dataFinal} min={dataInicial || undefined} onChange={setDataFinal} disabled={loading} atraso={0.04} />
        <button type="button" onClick={exportarPdf} disabled={pedidos.length === 0 || exportando} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold hover:bg-muted disabled:opacity-40">
          {exportando ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} PDF
        </button>
      </div>

      {!escopoDefinido ? (
        <motion.div
          initial={reduzir ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springs.settleFast}
          className="rounded-[1.25rem] bg-card px-6 py-14 text-center shadow-[0_2px_16px_rgba(14,15,19,.07)]"
        >
          <div className="mx-auto flex max-w-md flex-col items-center gap-4">
            <BrandLogoGroup height={26} className="opacity-90" />
            <p className="text-base font-bold text-foreground" style={{ fontFamily: "var(--font-sora)" }}>
              Escolha uma empresa ou canal para começar
            </p>
          </div>
        </motion.div>
      ) : (
      <div className="flex flex-col gap-4">
      <motion.section
        variants={escalonamento(reduzir)}
        initial="hidden"
        animate="show"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Resumo das vendas filtradas"
      >
        {[
          { label: "Faturamento", valor: dinheiro.format(resumo.faturamento), icon: CircleDollarSign, cor: "var(--success)" },
          { label: "Pedidos", valor: resumo.totalPedidos.toLocaleString("pt-BR"), icon: ShoppingBag, cor: "var(--info)" },
          { label: "Ticket médio", valor: dinheiro.format(resumo.ticketMedio), icon: ReceiptText, cor: "var(--acento-2)" },
          { label: "Cancelados/devolvidos", valor: resumo.cancelados.toLocaleString("pt-BR"), icon: Ban, cor: resumo.cancelados > 0 ? "var(--destructive)" : "var(--muted-foreground)" },
        ].map((card) => (
          <motion.div key={card.label} variants={variantes(reduzir, fadeUp)} whileHover={reduzir ? undefined : { y: -2 }} className="rounded-[1.15rem] bg-card p-4 shadow-[0_2px_14px_rgba(14,15,19,.06)] transition-shadow hover:shadow-[0_7px_22px_rgba(14,15,19,.09)]">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><card.icon size={15} style={{ color: card.cor }} />{card.label}</div>
            <p className="mt-2 text-xl font-black tabular-nums text-foreground">{card.valor}</p>
          </motion.div>
        ))}
      </motion.section>
      <motion.section
        initial={reduzir ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springs.settleFast}
        className="rounded-[1.25rem] bg-card shadow-[0_2px_16px_rgba(14,15,19,.07)] overflow-hidden"
        data-testid="pedidos-lista"
      >
        <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-foreground">{copy.title}</p>
          <span className="rounded-full bg-selecionado/10 px-2.5 py-1 text-xs font-bold text-selecionado tabular-nums">
            {total} {total === 1 ? "pedido" : "pedidos"}
          </span>
        </div>

        <div
          className={loading && pedidos.length > 0 ? "pointer-events-none opacity-55 transition-opacity" : "transition-opacity"}
          aria-busy={loading || undefined}
        >
          {loading && pedidos.length === 0 ? (
            <div>{[...Array(5)].map((_, i) => <SkeletonRow key={i} />)}</div>
          ) : pedidos.length === 0 ? (
            <EmptyState
              illustration={filtrando ? "slowMoving" : "reports"}
              title={filtrando ? copy.emptyFiltered.title : copy.empty}
              description={filtrando ? copy.emptyFiltered.description : undefined}
            />
          ) : (
            <>
              <div className="divide-y divide-border md:hidden" data-testid="pedidos-cards">
                {pedidos.map((item) => (
                  <Link
                    key={item.id}
                    href={`/vendas/pedidos/${item.id}`}
                    className="block px-4 py-4 transition-colors hover:bg-muted/30 focus-visible:bg-muted/30"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-foreground">
                          #{item.providerOrderId ?? item.id.slice(0, 8)}
                        </span>
                        <span className="mt-1 block truncate text-sm text-muted-foreground">{item.clienteNome}</span>
                        <span className="mt-0.5 block text-xs tabular-nums text-muted-foreground">{dataHora.format(new Date(item.createdAt))}</span>
                      </span>
                      <span className="shrink-0 text-sm font-bold tabular-nums text-foreground">
                        {dinheiro.format(Number(item.total))}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <span
                        className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
                        style={{
                          background: `color-mix(in srgb, ${CORES_STATUS[item.status] ?? "var(--muted-foreground)"} 10%, transparent)`,
                          color: CORES_STATUS[item.status] ?? "var(--muted-foreground)",
                        }}
                      >
                        {statusLabel(item.status)}
                      </span>
                      <span className="text-xs font-semibold text-selecionado">Ver detalhes</span>
                    </div>
                  </Link>
                ))}
              </div>
              <div className="hidden table-scroll md:block">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Pedido</th>
                    <th className="px-4 py-3 font-semibold">Cliente</th>
                    <th className="px-4 py-3 font-semibold">Data da venda</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pedidos.map((item) => (
                    <LinhaPedido
                      key={item.id}
                      item={item}
                      aberta={expandido === item.id}
                      onAlternar={() => setExpandido((atual) => atual === item.id ? null : item.id)}
                    />
                  ))}
                </tbody>
              </table>
              </div>
            </>
          )}
        </div>

        {pedidos.length > 0 && pedidos.length < total && (
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
                : `${copy.pagination.loadMore} ${Math.min(PAGINA, total - pedidos.length)}`}
            </motion.button>
            <p className="mt-2 text-[11px] text-muted-foreground tabular-nums">
              {copy.pagination.showing
                .replace("{carregados}", String(pedidos.length))
                .replace("{total}", String(total))}
            </p>
          </div>
        )}
      </motion.section>
      </div>
      )}
    </div>
  );
}
