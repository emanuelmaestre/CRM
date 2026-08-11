"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { motion, useReducedMotion } from "framer-motion";
import { Loader2 } from "lucide-react";
import {
  actionListarPedidosDetalhados, actionContarPedidosPorMarca, actionContarPedidosPorCanal,
} from "../actions";
import { SkeletonRow } from "@/shared/design-system/primitives/Skeleton";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { ChannelLogo } from "@/shared/design-system/primitives/ChannelLogo";
import { BrandLogo } from "@/shared/design-system/primitives/BrandLogo";
import { springs } from "@/shared/design-system/motion-variants";
import pagesConfig from "@/config/pages.json";
import channelsConfig from "@/config/channels.json";
import { getBrandConfig, isBrandSlug } from "@/shared/config/brands";

type CanalVenda = "mercadolivre" | "shopee" | "tiktokshop";
type Pedido = Awaited<ReturnType<typeof actionListarPedidosDetalhados>>["data"][number];
type Marca = Awaited<ReturnType<typeof actionContarPedidosPorMarca>>[number];
type Canal = Awaited<ReturnType<typeof actionContarPedidosPorCanal>>[number];

const copy = pagesConfig.pedidos;
const PAGINA = 50;

const dinheiro = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

const CORES_STATUS: Record<string, string> = {
  criado: "#6F6F6E",
  pago: "#2563EB",
  separado: "#2563EB",
  enviado: "#B57A00",
  entregue: "#1F8A4C",
  avaliacao_solicitada: "#1F8A4C",
  concluido: "#1F8A4C",
  cancelado: "#C21820",
  devolvido: "#C21820",
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

/* ── Pílula de marca ────────────────────────────────────────────
   Single-select, ao contrário do Estoque: um só filtro de escopo por vez
   basta aqui — a lista já é cronológica e não precisa isolar catálogos
   inteiros. Clicar na ativa desmarca (mesma regra de toggle de sempre). */
function MarcaPill({ marca, ativo, onClick }: { marca: Marca; ativo: boolean; onClick: () => void }) {
  const reduzir = useReducedMotion();
  const { slug } = marca;
  const vazia = marca.total === 0;
  const bloqueada = vazia && !ativo;
  // Narrowing precisa do `slug` como variável local: checar marca.slug direto
  // não persiste o type guard até o uso abaixo (TS não confia em acesso a
  // propriedade entre statements por causa de aliasing).
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
      className={`inline-flex h-[38px] items-center gap-2 rounded-full px-3.5 transition-colors ${
        bloqueada
          ? "border border-border opacity-40 cursor-not-allowed"
          : ativo
            ? "border-2 bg-card"
            : "border border-border bg-card hover:bg-muted"
      }`}
      style={ativo ? { borderColor: brandColor(slug) } : undefined}
    >
      {temIdentidade
        ? <BrandLogo brand={slug} height={15} />
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
      title={canal.conectado ? undefined : copy.channelSelector.disconnectedHint.replace("{canal}", label)}
      className={`inline-flex h-[38px] items-center gap-2 rounded-full px-3.5 transition-colors ${
        !canal.conectado
          ? "border border-border opacity-50 cursor-not-allowed"
          : ativo
            ? "border-2 border-[#9B30D9] bg-[rgba(155,48,217,.07)]"
            : "border border-border bg-card hover:bg-muted"
      }`}
    >
      <ChannelLogo canal={canal.tipo} size="xs" variant="logo" />
      <span className="text-[13px] font-semibold text-foreground">{label}</span>
      <span className="text-[11px] tabular-nums text-muted-foreground">{canal.total}</span>
    </motion.button>
  );
}

export function PedidosLista() {
  const reduzir = useReducedMotion();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [brandId, setBrandId] = useState("");
  const [canal, setCanal] = useState<CanalVenda | "">("");
  const [status, setStatus] = useState("");
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [canais, setCanais] = useState<Canal[]>([]);
  const requestId = useRef(0);
  const [, startTransition] = useTransition();

  useEffect(() => {
    actionContarPedidosPorMarca(canal || undefined).then(setMarcas).catch(() => setMarcas([]));
  }, [canal]);

  useEffect(() => {
    actionContarPedidosPorCanal(brandId || undefined).then(setCanais).catch(() => setCanais([]));
  }, [brandId]);

  const carregar = useCallback((marca?: string, canalAtual?: string, statusAtual?: string) => {
    const currentRequest = ++requestId.current;
    startTransition(async () => {
      setLoading(true);
      try {
        const res = await actionListarPedidosDetalhados({
          brandId: marca || undefined,
          canal: canalAtual || undefined,
          status: statusAtual || undefined,
        });
        if (currentRequest !== requestId.current) return;
        setPedidos(res.data);
        setTotal(res.total);
      } catch {
        if (currentRequest !== requestId.current) return;
        toast.error(copy.loadError);
      } finally {
        if (currentRequest === requestId.current) setLoading(false);
      }
    });
  }, []);

  useEffect(() => { carregar(brandId, canal, status); }, [brandId, canal, status, carregar]);

  async function carregarMais() {
    setCarregandoMais(true);
    try {
      const res = await actionListarPedidosDetalhados({
        brandId: brandId || undefined,
        canal: canal || undefined,
        status: status || undefined,
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

  const filtrando = brandId !== "" || canal !== "" || status !== "";

  return (
    <div>
      {/* Barra de escopo — mesmo par marca/canal do Estoque, lado a lado. */}
      <div className="mb-4 flex flex-col gap-3 rounded-[1.25rem] bg-card px-4 py-3.5 shadow-[0_2px_16px_rgba(14,15,19,.07)] lg:flex-row lg:items-start lg:gap-6">
        <div className="min-w-0">
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">{copy.brandSelector.label}</p>
          <div className="flex flex-wrap gap-2">
            {marcas.map((marca) => (
              <MarcaPill
                key={marca.brandId}
                marca={marca}
                ativo={brandId === marca.brandId}
                onClick={() => setBrandId((atual) => atual === marca.brandId ? "" : marca.brandId)}
              />
            ))}
          </div>
        </div>

        <div aria-hidden="true" className="hidden w-px shrink-0 self-stretch bg-border lg:block" />

        <div className="min-w-0">
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">{copy.channelSelector.label}</p>
          <div className="flex flex-wrap gap-2">
            {canais.map((item) => (
              <CanalPill
                key={item.tipo}
                canal={item}
                ativo={canal === item.tipo}
                onClick={() => setCanal((atual) => atual === item.tipo ? "" : item.tipo)}
              />
            ))}
          </div>
          {canais.some((item) => !item.conectado) && (
            <p className="mt-1.5 text-[11px] text-muted-foreground">{copy.channelSelector.disconnectedFootnote}</p>
          )}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {copy.statusFilter.label}
        </span>
        <button
          type="button"
          onClick={() => setStatus("")}
          aria-pressed={status === ""}
          className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition-colors ${
            status === ""
              ? "border-2 border-[#9B30D9] bg-[rgba(155,48,217,.07)] text-foreground"
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
                  ? "border-2 border-[#9B30D9] bg-[rgba(155,48,217,.07)] text-foreground"
                  : "border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {cor && <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: cor }} />}
              {statusLabel(valor)}
            </button>
          );
        })}
      </div>

      <motion.section
        initial={reduzir ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springs.settleFast}
        className="rounded-[1.25rem] bg-card shadow-[0_2px_16px_rgba(14,15,19,.07)] overflow-hidden"
        data-testid="pedidos-lista"
      >
        <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-foreground">{copy.title}</p>
          <span className="rounded-full bg-[#9B30D9]/10 px-2.5 py-1 text-xs font-bold text-[#9B30D9] tabular-nums">
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
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    {copy.columns.map((coluna) => (
                      <th key={coluna} className="px-4 py-3 font-semibold">{coluna}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pedidos.map((item) => (
                    <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-semibold">
                        <Link className="hover:underline" href={`/vendas/pedidos/${item.id}`}>
                          #{item.providerOrderId ?? item.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="px-4 py-3">{item.clienteNome}</td>
                      <td className="px-4 py-3" style={{ color: brandColor(item.brandSlug) }}>{item.brandNome}</td>
                      <td className="px-4 py-3">{canalLabel(item.canal)}</td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
                          style={{
                            background: `color-mix(in srgb, ${CORES_STATUS[item.status] ?? "#6F6F6E"} 10%, transparent)`,
                            color: CORES_STATUS[item.status] ?? "#6F6F6E",
                          }}
                        >
                          {statusLabel(item.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular-nums">{dinheiro.format(Number(item.total))}</td>
                      <td className="px-4 py-3 text-muted-foreground">{dataHora.format(new Date(item.createdAt))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
  );
}
