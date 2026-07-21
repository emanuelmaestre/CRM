"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
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
        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {copy.button.replace("+ ", "")}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-[1.25rem] shadow-xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-foreground">{copy.title}</h2>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              <strong className="text-foreground">{produtoNome}</strong> — {copy.balancePrefix}: <strong className="text-foreground">{saldoAtual}</strong>
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

              <div className="flex gap-3 pt-2">
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
