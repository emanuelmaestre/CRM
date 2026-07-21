"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { actionCriarProduto } from "./actions";

const BRAND_ID_KARZI = process.env.NEXT_PUBLIC_BRAND_ID_KARZI ?? "";
const BRAND_ID_WUWU = process.env.NEXT_PUBLIC_BRAND_ID_WUWU ?? "";

export function NovoProdutoModal({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        await actionCriarProduto(formData);
        toast.success("Produto criado com sucesso!");
        setOpen(false);
        onSuccess();
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Erro ao criar produto.");
      }
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="h-10 px-4 rounded-[0.75rem] text-sm font-semibold text-white"
        style={{ background: "var(--gradient-signature)" }}
      >
        + Novo produto
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-[1.25rem] shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-foreground">Novo produto</h2>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Marca *</label>
                <select
                  name="brandId"
                  required
                  className="w-full h-10 px-3 rounded-[0.75rem] border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Selecione a marca</option>
                  <option value={process.env.NEXT_PUBLIC_BRAND_ID_KARZI ?? "karzi"}>KARZI</option>
                  <option value={process.env.NEXT_PUBLIC_BRAND_ID_WUWU ?? "wuwu"}>WUWU</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">SKU *</label>
                  <input
                    name="sku"
                    required
                    placeholder="KZ-001"
                    className="w-full h-10 px-3 rounded-[0.75rem] border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Estoque mínimo</label>
                  <input
                    name="estoqueMinimo"
                    type="number"
                    min="0"
                    defaultValue="0"
                    className="w-full h-10 px-3 rounded-[0.75rem] border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Nome do produto *</label>
                <input
                  name="nome"
                  required
                  placeholder="Ex: Caixa Organizadora 40L"
                  className="w-full h-10 px-3 rounded-[0.75rem] border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Preço de venda (R$) *</label>
                  <input
                    name="preco"
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder="0,00"
                    className="w-full h-10 px-3 rounded-[0.75rem] border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Custo (R$)</label>
                  <input
                    name="custo"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0,00"
                    className="w-full h-10 px-3 rounded-[0.75rem] border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 h-10 rounded-[0.75rem] border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="flex-1 h-10 rounded-[0.75rem] text-sm font-semibold text-white disabled:opacity-60"
                  style={{ background: "var(--gradient-signature)" }}
                >
                  {pending ? "Salvando…" : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
