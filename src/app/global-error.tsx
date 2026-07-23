"use client";

import { useEffect } from "react";
import appConfig from "@/config/app.json";
import pagesConfig from "@/config/pages.json";
import { logUiFailure } from "@/shared/observability/structured-log";

const copy = pagesConfig.system.globalError;

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
    <html lang={appConfig.locale}>
      <body>
        <main data-testid="global-error" style={{ margin: "0 auto", maxWidth: 560, padding: "15vh 24px", textAlign: "center" }}>
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
          <button type="button" onClick={unstable_retry}>{copy.retry}</button>
        </main>
      </body>
    </html>
  );
}
