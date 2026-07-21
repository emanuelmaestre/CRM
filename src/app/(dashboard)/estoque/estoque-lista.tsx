"use client";

import { useState, useCallback, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { MovimentoModal } from "./movimento-modal";
import { actionListarProdutos } from "./actions";
import { SkeletonRow } from "@/shared/design-system/primitives/Skeleton";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";

type Produto = {
  id: string; sku: string; nome: string; preco: string;
  estoqueMinimo: number; brandId: string; saldo?: number;
};

const BRAND_KARZI = process.env.NEXT_PUBLIC_BRAND_ID_KARZI ?? "";
const BRAND_WUWU  = process.env.NEXT_PUBLIC_BRAND_ID_WUWU  ?? "";

function brandLabel(brandId: string) {
  if (brandId === BRAND_KARZI) return { label: "KARZI", color: "var(--karzi)" };
  if (brandId === BRAND_WUWU)  return { label: "WUWU",  color: "var(--wuwu)"  };
  return { label: brandId, color: "var(--muted-foreground)" };
}

export function EstoqueLista() {
  const router = useRouter();
  const [produtos, setProdutos]   = useState<Produto[]>([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [, startTransition]       = useTransition();

  const carregar = useCallback(() => {
    startTransition(async () => {
      setLoading(true);
      try {
        const res = await actionListarProdutos();
        setProdutos(res.data as Produto[]);
        setTotal(res.total);
      } catch {
        toast.error("Erro ao carregar produtos.");
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
            Estoque
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Livro-razão imutável — saldo único por SKU</p>
        </div>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => router.push("/estoque/novo")}
          className="h-10 px-4 rounded-[0.75rem] text-sm font-semibold text-white shadow-[0_4px_14px_rgba(227,19,27,.3)]"
          style={{ background: "var(--gradient-signature)" }}
        >
          + Novo produto
        </motion.button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
        className="rounded-[1.25rem] bg-card shadow-[0_2px_16px_rgba(14,15,19,.07)] overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Produtos e saldos</p>
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
                title="Nenhum produto cadastrado"
                description="Cadastre produtos para começar a controlar o estoque."
                action={
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => router.push("/estoque/novo")}
                    className="h-10 px-5 rounded-[0.75rem] text-sm font-semibold text-white"
                    style={{ background: "var(--gradient-signature)" }}
                  >
                    + Novo produto
                  </motion.button>
                }
              />
            </motion.div>
          ) : (
            <motion.div key="table" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {["SKU", "Produto", "Marca", "Saldo", "Preço", ""].map((h, i) => (
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
                        transition={{ delay: i * 0.05, duration: 0.25 }}
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
                            <motion.span
                              animate={{ opacity: [1, 0.4, 1] }}
                              transition={{ duration: 1.5, repeat: Infinity }}
                              className="ml-1.5 text-[10px] text-[#C21820]"
                            >
                              ▼ mín
                            </motion.span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right text-muted-foreground hidden md:table-cell">
                          R$ {Number(p.preco).toFixed(2)}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <MovimentoModal
                            produtoId={p.id}
                            produtoNome={p.nome}
                            saldoAtual={saldo}
                            onSuccess={carregar}
                          />
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
    </div>
  );
}
