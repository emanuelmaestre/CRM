"use client";

import { useState, useCallback, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MovimentoModal } from "./movimento-modal";
import { actionListarProdutos } from "./actions";
import { SkeletonRow } from "@/shared/design-system/primitives/Skeleton";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";

type Produto = {
  id: string;
  sku: string;
  nome: string;
  preco: string;
  estoqueMinimo: number;
  brandId: string;
  saldo?: number;
};

const BRAND_KARZI = process.env.NEXT_PUBLIC_BRAND_ID_KARZI ?? "";
const BRAND_WUWU = process.env.NEXT_PUBLIC_BRAND_ID_WUWU ?? "";

function brandLabel(brandId: string) {
  if (brandId === BRAND_KARZI) return { label: "KARZI", color: "var(--karzi)" };
  if (brandId === BRAND_WUWU) return { label: "WUWU", color: "var(--wuwu)" };
  return { label: brandId, color: "var(--muted-foreground)" };
}

export function EstoqueLista() {
  const router = useRouter();
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [, startTransition] = useTransition();

  const carregar = useCallback(() => {
    setLoading(true);
    startTransition(async () => {
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Estoque</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Livro-razão imutável — saldo único por SKU</p>
        </div>
        <button
          onClick={() => router.push("/estoque/novo")}
          className="h-10 px-4 rounded-[0.75rem] text-sm font-semibold text-white"
          style={{ background: "var(--gradient-signature)" }}
        >
          + Novo produto
        </button>
      </div>

      <div className="rounded-[1.25rem] border border-border bg-card shadow-[0_4px_20px_rgba(14,15,19,.06)] overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Produtos e saldos</p>
          <span className="text-xs text-muted-foreground">{total} {total === 1 ? "produto" : "produtos"}</span>
        </div>

        {loading ? (
          <div>
            {[...Array(4)].map((_, i) => <SkeletonRow key={i} />)}
          </div>
        ) : produtos.length === 0 ? (
          <EmptyState
            illustration="products"
            title="Nenhum produto cadastrado"
            description="Cadastre produtos para começar a controlar o estoque."
            action={
              <button
                onClick={() => router.push("/estoque/novo")}
                className="h-10 px-5 rounded-[0.75rem] text-sm font-semibold text-white"
                style={{ background: "var(--gradient-signature)" }}
              >
                + Novo produto
              </button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">SKU</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Produto</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Marca</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Saldo</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide hidden md:table-cell">Preço</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {produtos.map((p) => {
                  const brand = brandLabel(p.brandId);
                  const saldo = p.saldo ?? 0;
                  const emAlerta = saldo <= p.estoqueMinimo;
                  return (
                    <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
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
                        <span className={emAlerta ? "text-[#C21820] font-semibold" : "text-foreground font-semibold"}>
                          {saldo}
                        </span>
                        {emAlerta && (
                          <span className="ml-1.5 text-[10px] text-[#C21820]">▼ mín</span>
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
