"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { verificarPinClientes } from "./pin-actions";

export function ClientesPinGate() {
  const [pin, setPin] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    startTransition(async () => {
      const resultado = await verificarPinClientes(pin);
      if (!resultado.ok) {
        setErro(resultado.erro ?? "PIN incorreto.");
        toast.error(resultado.erro ?? "PIN incorreto.");
        setPin("");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-foreground">Acesso a clientes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Digite o PIN de 6 dígitos para visualizar os dados dos clientes.
        </p>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label htmlFor="clientes-pin" className="sr-only">
              PIN de acesso
            </label>
            <input
              id="clientes-pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              required
              aria-invalid={erro ? "true" : undefined}
              aria-describedby={erro ? "clientes-pin-error" : undefined}
              value={pin}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
                setPin(digits);
                if (erro) setErro(null);
              }}
              className="w-full h-11 rounded-[0.75rem] border border-border bg-background px-3 text-center text-lg tracking-[0.5em] text-foreground placeholder:tracking-normal placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="••••••"
            />
          </div>
          {erro && (
            <p
              id="clientes-pin-error"
              role="alert"
              className="rounded-xl bg-destructive/10 px-3 py-2.5 text-sm font-medium text-destructive"
            >
              {erro}
            </p>
          )}
          <button
            type="submit"
            disabled={pending || pin.length !== 6}
            className="w-full h-11 rounded-[0.75rem] font-semibold text-sm text-white disabled:opacity-60"
            style={{ background: "var(--gradient-signature)" }}
          >
            {pending ? "Verificando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
