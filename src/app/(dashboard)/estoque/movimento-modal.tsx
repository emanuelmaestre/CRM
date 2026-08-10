"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowLeftRight } from "lucide-react";
import { actionRegistrarMovimento } from "./actions";
import pagesConfig from "@/config/pages.json";

const copy = pagesConfig.estoque.movement;

interface Props {
  produtoId: string;
  produtoNome: string;
  saldoAtual: number;
  onSuccess: () => void;
}

export function MovimentoModal({ produtoId, produtoNome, saldoAtual, onSuccess }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const tipo = fd.get("tipo") as "entrada" | "saida" | "ajuste";
    const quantidade = Number(fd.get("quantidade"));
    const obs = fd.get("observacao") as string;

    startTransition(async () => {
      try {
        await actionRegistrarMovimento(produtoId, tipo, quantidade, obs || undefined);
        toast.success(copy.success);
        setOpen(false);
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
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-semibold text-foreground shadow-[0_1px_2px_rgba(14,15,19,.05)] transition-colors hover:border-[rgba(155,48,217,.4)] hover:bg-muted active:scale-[.97]"
      >
        <ArrowLeftRight size={13} strokeWidth={2} />
        {copy.button.replace("+ ", "")}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/40 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-sm sm:items-center sm:p-4">
          <div role="dialog" aria-modal="true" className="max-h-[calc(100dvh-1.5rem)] w-full max-w-sm overflow-y-auto rounded-[1.25rem] border border-border bg-card p-4 shadow-xl sm:p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-foreground">{copy.title}</h2>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              <strong className="text-foreground">{produtoNome}</strong> · {copy.balancePrefix}: <strong className="text-foreground">{saldoAtual}</strong>
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">{copy.fields.type} *</label>
                <select
                  name="tipo"
                  required
                  className="w-full h-10 px-3 rounded-[0.75rem] border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {Object.entries(copy.types).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">{copy.fields.quantity} *</label>
                <input
                  name="quantidade"
                  type="number"
                  min="1"
                  required
                  className="w-full h-10 px-3 rounded-[0.75rem] border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">{copy.fields.note}</label>
                <input
                  name="observacao"
                  placeholder={copy.fields.notePlaceholder}
                  className="w-full h-10 px-3 rounded-[0.75rem] border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="flex flex-col-reverse gap-3 pt-2 min-[380px]:flex-row">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 h-10 rounded-[0.75rem] border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors"
                >
                  {copy.cancel}
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="flex-1 h-10 rounded-[0.75rem] text-sm font-semibold text-white disabled:opacity-60"
                  style={{ background: "var(--gradient-signature)" }}
                >
                  {pending ? copy.submitting : copy.submit}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
