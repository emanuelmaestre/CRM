"use client";

import { useState, useCallback, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Link2 } from "lucide-react";
import { MovimentoModal } from "./movimento-modal";
import { CanalModal } from "./canal-modal";
import { actionListarProdutos } from "./actions";
import { SkeletonRow } from "@/shared/design-system/primitives/Skeleton";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import brandsConfig from "@/config/brands.json";
import pagesConfig from "@/config/pages.json";

type Produto = {
  id: string; sku: string; nome: string; preco: string;
  estoqueMinimo: number; brandId: string; saldo?: number;
};

const BRAND_KARZI = process.env.NEXT_PUBLIC_BRAND_ID_KARZI ?? "";
const BRAND_WUWU  = process.env.NEXT_PUBLIC_BRAND_ID_WUWU  ?? "";
const copy = pagesConfig.estoque;

function brandLabel(brandId: string) {
  if (brandId === BRAND_KARZI) return { label: brandsConfig.karzi.label, color: brandsConfig.karzi.color };
  if (brandId === BRAND_WUWU)  return { label: brandsConfig.wuwu.label, color: brandsConfig.wuwu.color };
  return { label: brandId, color: "var(--muted-foreground)" };
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
        {canManage && <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => router.push("/estoque/novo")}
          className="h-10 px-4 rounded-[0.75rem] text-sm font-semibold text-white shadow-[0_4px_14px_rgba(227,19,27,.3)]"
          style={{ background: "var(--gradient-signature)" }}
        >
          {copy.newAction}
        </motion.button>}
      </motion.div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px] mb-4">
        <input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder={copy.searchPlaceholder} className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm" />
        <select value={brandId} onChange={(event) => setBrandId(event.target.value)} className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm">
          <option value="">{copy.allBrands}</option>
          <option value={BRAND_KARZI}>{brandsConfig.karzi.label}</option>
          <option value={BRAND_WUWU}>{brandsConfig.wuwu.label}</option>
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
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => router.push("/estoque/novo")}
                    className="h-10 px-5 rounded-[0.75rem] text-sm font-semibold text-white"
                    style={{ background: "var(--gradient-signature)" }}
                  >
                    {copy.newAction}
                  </motion.button>
                  ) : undefined
                }
              />
            </motion.div>
          ) : (
            <motion.div key="table" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="md:hidden divide-y divide-border" data-testid="estoque-cards">
                {produtos.map((p) => {
                  const brand = brandLabel(p.brandId);
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
                      {canManage && <div className="flex min-h-11 items-center justify-end gap-2"><button type="button" onClick={() => setCanalProduto({ id: p.id, nome: p.nome })} className="min-h-11 px-3 inline-flex items-center gap-2 text-sm text-muted-foreground"><Link2 size={15} /> {copy.mobile.channels}</button><MovimentoModal produtoId={p.id} produtoNome={p.nome} saldoAtual={saldo} onSuccess={() => carregar(brandId, busca)} /></div>}
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
                    const brand   = brandLabel(p.brandId);
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
