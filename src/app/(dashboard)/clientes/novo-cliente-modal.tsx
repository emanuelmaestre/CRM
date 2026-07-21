"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { actionCriarCliente } from "./actions";

export function NovoClienteModal({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    // Validação básica
    const nome = formData.get("nome") as string;
    if (!nome || nome.trim().length < 2) {
      toast.error("Nome deve ter ao menos 2 caracteres.");
      return;
    }

    // Formatar telefone para E.164
    const tel = (formData.get("telefone") as string).trim();
    if (tel) {
      const digits = tel.replace(/\D/g, "");
      const e164 = "+" + (digits.startsWith("55") ? digits : "55" + digits);
      formData.set("telefone", e164);
    }

    startTransition(async () => {
      try {
        await actionCriarCliente(formData);
        toast.success("Cliente criado com sucesso!");
        setOpen(false);
        onSuccess();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Erro ao criar cliente.";
        toast.error(msg);
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
        + Novo cliente
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-[1.25rem] shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-foreground">Novo cliente</h2>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Nome *</label>
                <input
                  name="nome"
                  required
                  placeholder="Nome completo"
                  className="w-full h-10 px-3 rounded-[0.75rem] border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">E-mail</label>
                <input
                  name="email"
                  type="email"
                  placeholder="cliente@exemplo.com"
                  className="w-full h-10 px-3 rounded-[0.75rem] border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">WhatsApp</label>
                <input
                  name="telefone"
                  placeholder="(11) 99999-9999"
                  className="w-full h-10 px-3 rounded-[0.75rem] border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">CPF / CNPJ</label>
                <input
                  name="cpfCnpj"
                  placeholder="000.000.000-00"
                  className="w-full h-10 px-3 rounded-[0.75rem] border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
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
                  className="flex-1 h-10 rounded-[0.75rem] text-sm font-semibold text-white disabled:opacity-60 transition-opacity"
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
