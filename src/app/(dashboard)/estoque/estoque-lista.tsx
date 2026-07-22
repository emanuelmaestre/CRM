"use client";

import { useState, useCallback, useEffect, useTransition } from "react";
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
  const [, startTransition]       = useTransition();
  const [canalProduto, setCanalProduto] = useState<{ id: string; nome: string } | null>(null);

  const carregar = useCallback(() => {
    startTransition(async () => {
      setLoading(true);
      try {
        const res = await actionListarProdutos();
        setProdutos(res.data as Produto[]);
        setTotal(res.total);
      } catch {
        toast.error(copy.messages.loadError);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

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
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => router.push("/estoque/novo")}
          className="h-10 px-4 rounded-[0.75rem] text-sm font-semibold text-white shadow-[0_4px_14px_rgba(227,19,27,.3)]"
          style={{ background: "var(--gradient-signature)" }}
        >
          {copy.newAction}
        </motion.button>
      </motion.div>

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
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => router.push("/estoque/novo")}
                    className="h-10 px-5 rounded-[0.75rem] text-sm font-semibold text-white"
                    style={{ background: "var(--gradient-signature)" }}
                  >
                    {copy.newAction}
                  </motion.button>
                }
              />
            </motion.div>
          ) : (
            <motion.div key="table" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="overflow-x-auto">
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
                          <span className={alerta ? "text-[#C21820] font-semibold" : "text-foreground font-semibold"}>
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
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setCanalProduto({ id: p.id, nome: p.nome })}
                              className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                              title="Mapear canais de venda"
                            >
                              <Link2 size={15} />
                            </button>
                            <MovimentoModal
                              produtoId={p.id}
                              produtoNome={p.nome}
                              saldoAtual={saldo}
                              onSuccess={carregar}
                            />
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
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
