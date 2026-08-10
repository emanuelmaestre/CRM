"use client";

import { useState, useCallback, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Link2, Loader2, RefreshCw } from "lucide-react";
import { MovimentoModal } from "./movimento-modal";
import { EditarProdutoModal } from "./editar-produto-modal";
import { CanalModal } from "./canal-modal";
import {
  actionListarMarcasEstoque, actionListarProdutos, actionListarProdutosParados,
  actionListarDivergenciasEstoque, actionResolverDivergenciaEstoque, actionImportarCatalogoEstoque,
} from "./actions";
import { SkeletonRow } from "@/shared/design-system/primitives/Skeleton";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import pagesConfig from "@/config/pages.json";
import channelsConfig from "@/config/channels.json";
import { getBrandConfig } from "@/shared/config/brands";

type Produto = {
  id: string; sku: string; nome: string; preco: string; custo?: string | null;
  estoqueMinimo: number; brandId: string; brandName: string; brandSlug: string; saldo?: number;
};

const copy = pagesConfig.estoque;

function brandLabel(produto: Produto) {
  return {
    label: produto.brandName,
    color: getBrandConfig(produto.brandSlug)?.color ?? "var(--muted-foreground)",
  };
}

type ProdutoParado = Awaited<ReturnType<typeof actionListarProdutosParados>>[number];

function ProdutosParadosPanel() {
  const pc = copy.parados;
  const [aberto, setAberto] = useState(false);
  const [parados, setParados] = useState<ProdutoParado[] | null>(null);

  useEffect(() => {
    if (aberto && parados === null) {
      actionListarProdutosParados().then(setParados).catch(() => setParados([]));
    }
  }, [aberto, parados]);

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => setAberto((value) => !value)}
        className="min-h-11 text-sm font-medium text-primary"
        data-testid="toggle-produtos-parados"
      >
        {aberto ? pc.toggleHide : pc.toggleShow}
      </button>

      {aberto && (
        <section className="mt-3 rounded-[1.25rem] border border-border bg-card overflow-hidden" data-testid="produtos-parados-painel">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold">{pc.title}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{pc.subtitle}</p>
          </div>
          <div className="divide-y divide-border">
            {parados === null ? (
              <SkeletonRow />
            ) : parados.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted-foreground">{pc.empty}</p>
            ) : (
              parados.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div>
                    <p className="font-medium">{item.nome}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 font-mono">{item.sku}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">{item.diasSemVenda} {pc.daysSuffix}</p>
                    <p className="text-xs font-semibold mt-0.5">{pc.capitalLabel}: R$ {item.capitalParado.toFixed(2)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      )}
    </div>
  );
}

type Divergencia = Awaited<ReturnType<typeof actionListarDivergenciasEstoque>>[number];

function canalLabel(canal: string) {
  const items = channelsConfig.items as Record<string, { label?: string }>;
  return items[canal]?.label ?? canal;
}

function DivergenciasEstoquePanel() {
  const dc = pagesConfig.estoque.divergencias;
  const [aberto, setAberto] = useState(false);
  const [divergencias, setDivergencias] = useState<Divergencia[] | null>(null);
  const [resolvendo, setResolvendo] = useState<{ id: string; decisao: "aplicar_canal" | "ignorar" } | null>(null);

  const carregar = useCallback(() => {
    actionListarDivergenciasEstoque().then(setDivergencias).catch(() => {
      setDivergencias([]);
      toast.error(dc.loadError);
    });
  }, [dc.loadError]);

  useEffect(() => {
    if (aberto && divergencias === null) carregar();
  }, [aberto, divergencias, carregar]);

  async function resolver(id: string, decisao: "aplicar_canal" | "ignorar") {
    setResolvendo({ id, decisao });
    try {
      await actionResolverDivergenciaEstoque(id, decisao);
      toast.success(decisao === "aplicar_canal" ? dc.applySuccess : dc.ignoreSuccess);
      setDivergencias((atual) => atual?.filter((item) => item.id !== id) ?? atual);
    } catch {
      toast.error(decisao === "aplicar_canal" ? dc.applyError : dc.ignoreError);
    } finally {
      setResolvendo(null);
    }
  }

  const pendentes = divergencias?.length ?? 0;

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => setAberto((value) => !value)}
        className="min-h-11 text-sm font-medium text-primary"
        data-testid="toggle-divergencias-estoque"
      >
        {aberto ? dc.toggleHide : dc.toggleShow}
        {pendentes > 0 ? ` (${pendentes})` : ""}
      </button>

      {aberto && (
        <section className="mt-3 rounded-[1.25rem] border border-border bg-card overflow-hidden" data-testid="divergencias-estoque-painel">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold">{dc.title}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{dc.subtitle}</p>
          </div>
          <div className="divide-y divide-border">
            {divergencias === null ? (
              <SkeletonRow />
            ) : divergencias.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted-foreground">{dc.empty}</p>
            ) : (
              divergencias.map((item) => {
                const aplicando = resolvendo?.id === item.id && resolvendo.decisao === "aplicar_canal";
                const ignorando = resolvendo?.id === item.id && resolvendo.decisao === "ignorar";
                const ocupado = resolvendo?.id === item.id;
                return (
                  <div key={item.id} className="flex flex-col gap-3 px-5 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
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
                        {ignorando ? <Loader2 size={13} className="animate-spin" /> : dc.ignoreAction}
                      </button>
                      <button
                        type="button"
                        disabled={ocupado}
                        onClick={() => resolver(item.id, "aplicar_canal")}
                        className="min-h-9 inline-flex items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-white disabled:opacity-60"
                        style={{ background: "var(--gradient-signature)" }}
                      >
                        {aplicando && <Loader2 size={13} className="animate-spin" />}
                        {aplicando ? dc.applyingAction : dc.applyAction}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      )}
    </div>
  );
}

export function EstoqueLista() {
  const router = useRouter();
  const [produtos, setProdutos]   = useState<Produto[]>([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [busca, setBusca]         = useState("");
  const [brandId, setBrandId]     = useState("");
  const [canManage, setCanManage] = useState(false);
  const requestId = useRef(0);
  const [, startTransition]       = useTransition();
  const [canalProduto, setCanalProduto] = useState<{ id: string; nome: string } | null>(null);
  const [marcas, setMarcas] = useState<Awaited<ReturnType<typeof actionListarMarcasEstoque>>>([]);
  const [sincronizando, setSincronizando] = useState(false);

  useEffect(() => {
    actionListarMarcasEstoque().then(setMarcas).catch(() => setMarcas([]));
  }, []);

  const carregar = useCallback((marca?: string, termo?: string) => {
    const currentRequest = ++requestId.current;
    startTransition(async () => {
      setLoading(true);
      try {
        const res = await actionListarProdutos(marca || undefined, termo || undefined);
        if (currentRequest !== requestId.current) return;
        setProdutos(res.data as Produto[]);
        setTotal(res.total);
        setCanManage(res.permissions.canManage);
      } catch {
        if (currentRequest !== requestId.current) return;
        toast.error(copy.messages.loadError);
      } finally {
        if (currentRequest === requestId.current) setLoading(false);
      }
    });
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => carregar(brandId, busca), busca ? 300 : 0);
    return () => clearTimeout(timer);
  }, [brandId, busca, carregar]);

  async function sincronizar() {
    setSincronizando(true);
    try {
      const resultado = await actionImportarCatalogoEstoque();
      if (resultado.produtosCriados > 0) {
        toast.success(copy.syncSuccess.replace("{criados}", String(resultado.produtosCriados)));
        carregar(brandId, busca);
      } else {
        toast.info(copy.syncNothingNew);
      }
    } catch {
      toast.error(copy.syncError);
    } finally {
      setSincronizando(false);
    }
  }

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6"
      >
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "var(--font-sora)" }}>
            {copy.title}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{copy.description}</p>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
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
          </div>
        )}
      </motion.div>

      <ProdutosParadosPanel />
      {canManage && <DivergenciasEstoquePanel />}

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px] mb-4">
        <input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder={copy.searchPlaceholder} className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm" />
        <select value={brandId} onChange={(event) => setBrandId(event.target.value)} className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm">
          <option value="">{copy.allBrands}</option>
          {marcas.map((marca) => <option key={marca.id} value={marca.id}>{marca.name}</option>)}
        </select>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
        className="rounded-[1.25rem] bg-card shadow-[0_2px_16px_rgba(14,15,19,.07)] overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">{copy.sectionTitle}</p>
          <motion.span
            key={total}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-xs text-muted-foreground tabular-nums"
          >
            {total} {total === 1 ? "produto" : "produtos"}
          </motion.span>
        </div>

        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div key="loading" exit={{ opacity: 0 }}>
              {[...Array(4)].map((_, i) => <SkeletonRow key={i} />)}
            </motion.div>
          ) : produtos.length === 0 ? (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <EmptyState
                illustration="products"
                title={copy.empty.title}
                description={copy.empty.description}
                action={
                  canManage ? (
                  <div className="flex items-center gap-2">
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
            <motion.div key="table" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="md:hidden divide-y divide-border" data-testid="estoque-cards">
                {produtos.map((p) => {
                  const brand = brandLabel(p);
                  const saldo = p.saldo ?? 0;
                  const alerta = saldo <= p.estoqueMinimo;
                  return (
                    <article key={p.id} className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div><p className="font-semibold text-foreground">{p.nome}</p><p className="font-mono text-xs text-muted-foreground mt-1">{p.sku}</p></div>
                        <span className="text-xs px-2 py-1 rounded-full font-semibold" style={{ background: `${brand.color}20`, color: brand.color }}>{brand.label}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div><p className="text-xs text-muted-foreground">{copy.mobile.balance}</p><p data-testid={`saldo-${p.sku}`} className={alerta ? "font-bold text-destructive" : "font-bold"}>{saldo}{alerta ? ` ${copy.minimumIndicator}` : ""}</p></div>
                        <div><p className="text-xs text-muted-foreground">{copy.mobile.price}</p><p className="font-semibold">R$ {Number(p.preco).toFixed(2)}</p></div>
                      </div>
                      {canManage && <div className="flex min-h-11 items-center justify-end gap-2">
                        <EditarProdutoModal produtoId={p.id} produtoNome={p.nome} preco={p.preco} custo={p.custo} estoqueMinimo={p.estoqueMinimo} onSuccess={() => carregar(brandId, busca)} />
                        <button type="button" onClick={() => setCanalProduto({ id: p.id, nome: p.nome })} className="min-h-11 px-3 inline-flex items-center gap-2 text-sm text-muted-foreground"><Link2 size={15} /> {copy.mobile.channels}</button>
                        <MovimentoModal produtoId={p.id} produtoNome={p.nome} saldoAtual={saldo} onSuccess={() => carregar(brandId, busca)} />
                      </div>}
                    </article>
                  );
                })}
              </div>
              <div className="hidden md:block overflow-x-auto" data-testid="estoque-table">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {copy.columns.map((h, i) => (
                      <th key={i} className={`text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide ${
                        i === 2 ? "hidden sm:table-cell" : i === 4 ? "hidden md:table-cell text-right" : i === 3 ? "text-right" : ""
                      }`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {produtos.map((p, i) => {
                    const brand   = brandLabel(p);
                    const saldo   = p.saldo ?? 0;
                    const alerta  = saldo <= p.estoqueMinimo;
                    return (
                      <motion.tr
                        key={p.id}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03, duration: 0.22, ease: [0, 0, 0.2, 1] }}
                        whileHover={{ backgroundColor: "rgba(0,0,0,0.018)" }}
                        className="border-b border-border last:border-0"
                      >
                        <td className="px-5 py-3.5 font-mono text-xs text-muted-foreground">{p.sku}</td>
                        <td className="px-5 py-3.5 font-medium text-foreground">{p.nome}</td>
                        <td className="px-5 py-3.5 hidden sm:table-cell">
                          <span
                            className="text-xs px-2 py-0.5 rounded-full font-semibold"
                            style={{ background: brand.color + "20", color: brand.color }}
                          >
                            {brand.label}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <span data-testid={`saldo-${p.sku}`} className={alerta ? "text-[#C21820] font-semibold" : "text-foreground font-semibold"}>
                            {saldo}
                          </span>
                          {alerta && (
                            <span
                              className="ml-1.5 text-[10px] text-[#C21820]"
                            >
                              {copy.minimumIndicator}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right text-muted-foreground hidden md:table-cell">
                          R$ {Number(p.preco).toFixed(2)}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          {canManage && <div className="flex items-center justify-end gap-2">
                            <EditarProdutoModal
                              produtoId={p.id}
                              produtoNome={p.nome}
                              preco={p.preco}
                              custo={p.custo}
                              estoqueMinimo={p.estoqueMinimo}
                              onSuccess={() => carregar(brandId, busca)}
                            />
                            <button
                              onClick={() => setCanalProduto({ id: p.id, nome: p.nome })}
                              className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                              title={pagesConfig.estoque.channels.mapTitle}
                            >
                              <Link2 size={15} />
                            </button>
                            <MovimentoModal
                              produtoId={p.id}
                              produtoNome={p.nome}
                              saldoAtual={saldo}
                              onSuccess={() => carregar(brandId, busca)}
                            />
                          </div>}
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
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
