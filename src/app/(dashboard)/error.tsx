"use client";

import { useEffect } from "react";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { logUiFailure } from "@/shared/observability/structured-log";

export default function DashboardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    logUiFailure(error, {
      digest: error.digest,
      pathname: window.location.pathname,
      boundary: "dashboard",
    });
  }, [error]);

  return (
    <section data-testid="dashboard-error" className="mx-auto flex min-h-[50vh] max-w-xl flex-col items-center justify-center px-4 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <TriangleAlert aria-hidden="true" size={26} />
      </div>
      <h1 className="text-xl font-bold text-foreground">Não foi possível carregar esta área</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        A falha foi registrada com segurança. Tente novamente; se persistir, informe o código
        abaixo ao administrador.
      </p>
      {error.digest && (
        <code className="mt-3 rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
          Código: {error.digest}
        </code>
      )}
      <button
        type="button"
        onClick={unstable_retry}
        className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
      >
        <RotateCcw aria-hidden="true" size={16} />
        Tentar novamente
      </button>
    </section>
  );
}
