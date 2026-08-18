"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Eye, Pencil } from "lucide-react";
import { actionEditarProduto } from "./actions";
import { Dialog } from "@/shared/design-system/primitives/Dialog";
import pagesConfig from "@/config/pages.json";

const copy = pagesConfig.estoque.edit;

// O estoque mínimo saiu daqui de propósito: ele é editável direto na linha da
// lista (e em lote), porque configurá-lo produto a produto por modal inviabiliza
// um catálogo inteiro — ver MinimoInput em estoque-lista.tsx.
interface Props {
  produtoId: string;
  produtoNome: string;
  preco: string;
  onSuccess: () => void;
}

const dinheiro = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

// O botão da linha abre em modo de visualização — o lápis fica dentro do
// modal, não na tabela. Ver o produto é a ação comum (confirmar um dado
// antes de decidir algo); editar é a exceção, então não precisa de um botão
// próprio disputando espaço na linha inteira.
export function EditarProdutoModal({ produtoId, produtoNome, preco, onSuccess }: Props) {
  const [open, setOpen] = useState(false);
  const [modo, setModo] = useState<"ver" | "editar">("ver");
  const [pending, startTransition] = useTransition();

  function fechar() {
    setOpen(false);
    setModo("ver");
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const nome = fd.get("nome") as string;
    const precoValor = fd.get("preco") as string;

    startTransition(async () => {
      try {
        await actionEditarProduto(produtoId, nome, precoValor);
        toast.success(copy.success);
        fechar();
        onSuccess();
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : copy.error);
      }
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Ver produto"
        aria-label="Ver produto"
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-card text-foreground shadow-[0_1px_2px_rgba(14,15,19,.05)] transition-colors hover:border-selecionado/40 hover:bg-muted active:scale-[.97]"
      >
        <Eye size={14} strokeWidth={2} />
      </button>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => nextOpen ? setOpen(true) : fechar()}
        title={modo === "ver" ? "Detalhes do produto" : copy.title}
      >
            {modo === "ver" && (
              <button
                type="button"
                onClick={() => setModo("editar")}
                title={copy.button}
                aria-label={copy.button}
                className="absolute right-14 top-2.5 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Pencil size={14} strokeWidth={2} />
              </button>
            )}

            {modo === "ver" ? (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">{copy.fields.name}</p>
                  <p className="text-sm font-semibold text-foreground">{produtoNome}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">{copy.fields.price}</p>
                  <p className="text-sm font-semibold text-foreground">{dinheiro.format(Number(preco))}</p>
                </div>
                <p className="text-[11px] text-muted-foreground">{copy.syncHint}</p>
              </div>
            ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor={`produto-nome-${produtoId}`} className="block text-xs font-medium text-muted-foreground mb-1.5">{copy.fields.name} *</label>
                <input
                  id={`produto-nome-${produtoId}`}
                  name="nome"
                  defaultValue={produtoNome}
                  required
                  className="h-11 w-full rounded-[0.75rem] border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div>
                <label htmlFor={`produto-preco-${produtoId}`} className="block text-xs font-medium text-muted-foreground mb-1.5">{copy.fields.price} *</label>
                <input
                  id={`produto-preco-${produtoId}`}
                  name="preco"
                  type="number"
                  step="0.01"
                  min="0.01"
                  defaultValue={preco}
                  required
                  className="h-11 w-full rounded-[0.75rem] border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <p className="text-[11px] text-muted-foreground">{copy.syncHint}</p>

              <div className="flex flex-col-reverse gap-3 pt-2 min-[380px]:flex-row">
                <button
                  type="button"
                  onClick={() => setModo("ver")}
                  className="h-11 flex-1 rounded-[0.75rem] border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors"
                >
                  {copy.cancel}
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="h-11 flex-1 rounded-[0.75rem] text-sm font-semibold text-white disabled:opacity-60"
                  style={{ background: "var(--gradient-signature)" }}
                >
                  {pending ? copy.submitting : copy.submit}
                </button>
              </div>
            </form>
            )}
      </Dialog>
    </>
  );
}
