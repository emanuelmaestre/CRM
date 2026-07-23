"use client";

import { useEffect } from "react";
import { logUiFailure } from "@/shared/observability/structured-log";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    logUiFailure(error, { digest: error.digest, boundary: "global" });
  }, [error]);

  return (
    <html lang="pt-BR">
      <body>
        <main data-testid="global-error" style={{ margin: "0 auto", maxWidth: 560, padding: "15vh 24px", textAlign: "center" }}>
          <h1>O aplicativo encontrou uma falha</h1>
          <p>O erro foi registrado. Tente recarregar a aplicação.</p>
          <button type="button" onClick={unstable_retry}>Tentar novamente</button>
        </main>
      </body>
    </html>
  );
}
