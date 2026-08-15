"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { XCircle } from "lucide-react";
import { actionCancelarPedido } from "../../actions";
import pagesConfig from "@/config/pages.json";

const copy = pagesConfig.pedidos.detail;

/* Único gatilho manual de mudança de status hoje (as demais vêm da sincronização
   com o canal) — por isso pede um motivo em vez de um clique só: cancelar um
   pedido é irreversível pela tela e o motivo fica no livro-razão de auditoria. */
export function CancelarPedidoModal({ pedidoId }: { pedidoId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (motivo.trim().length < 3) {
      toast.error(copy.cancelReasonRequired);
      return;
    }
    startTransition(async () => {
      try {
        await actionCancelarPedido(pedidoId, motivo.trim());
        toast.success(copy.cancelSuccess);
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : copy.cancelError);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-1.5 rounded-[0.75rem] border px-4 text-sm font-semibold transition-colors"
        style={{ borderColor: "var(--destructive)", color: "var(--destructive)" }}
      >
        <XCircle size={15} strokeWidth={2} />
        {copy.cancelAction}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/40 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-sm sm:items-center sm:p-4">
          <div role="dialog" aria-modal="true" className="max-h-[calc(100dvh-1.5rem)] w-full max-w-sm overflow-y-auto rounded-[1.25rem] border border-border bg-card p-4 shadow-xl sm:p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-foreground">{copy.cancelTitle}</h2>
              <button type="button" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
            </div>

            <p className="text-sm text-muted-foreground mb-4">{copy.cancelDescription}</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  {copy.canceledReasonLabel}
                </label>
                <textarea
                  value={motivo}
                  onChange={(event) => setMotivo(event.target.value)}
                  placeholder={copy.cancelReasonPlaceholder}
                  rows={3}
                  autoFocus
                  className="w-full resize-none rounded-[0.75rem] border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="flex flex-col-reverse gap-3 pt-2 min-[380px]:flex-row">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 h-10 rounded-[0.75rem] border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors"
                >
                  {copy.cancelCancel}
                </button>
                <button
                  type="submit"
                  disabled={pending || motivo.trim().length < 3}
                  className="flex-1 h-10 rounded-[0.75rem] text-sm font-semibold text-white disabled:opacity-60"
                  style={{ background: "var(--destructive)" }}
                >
                  {pending ? copy.cancelAction + "…" : copy.cancelConfirm}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
