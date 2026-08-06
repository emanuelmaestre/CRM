"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import settingsConfig from "@/config/settings.json";

const mlConfig = settingsConfig.mercadoLivre;

type Feedback = { type: "success" | "error"; msg: string; detail?: string };

function derivarFeedback(searchParams: URLSearchParams): Feedback | null {
  const connected = searchParams.get("ml_connected");
  if (connected) {
    const brandLabel = mlConfig.brands.find((item) => item.slug === connected)?.label ?? connected;
    return { type: "success", msg: mlConfig.feedback.success.replace("{brand}", brandLabel) };
  }

  const error = searchParams.get("ml_error");
  if (!error) return null;

  const errors = mlConfig.feedback.errors as Record<string, string>;
  return {
    type: "error",
    msg: errors[error] ?? `Erro: ${error}`,
    detail: searchParams.get("ml_detail") ?? undefined,
  };
}

/**
 * Banner do retorno do OAuth. Isolado num componente próprio porque é a única
 * parte da página que depende de useSearchParams e precisa de Suspense.
 */
export function MLOAuthFeedback({ onConectado }: { onConectado?: () => void }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [feedback, setFeedback] = useState<Feedback | null>(() =>
    derivarFeedback(new URLSearchParams(searchParams.toString())),
  );

  // Limpa os parâmetros do retorno OAuth depois de derivar o feedback inicial.
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    const tinhaRetorno = params.has("ml_connected") || params.has("ml_error");
    if (!tinhaRetorno) return;

    if (params.has("ml_connected")) onConectado?.();
    params.delete("ml_connected");
    params.delete("ml_error");
    params.delete("ml_detail");
    const qs = params.toString();
    router.replace(pathname + (qs ? `?${qs}` : ""));
  }, [searchParams, router, pathname, onConectado]);

  return (
    <AnimatePresence>
      {feedback && (
        <motion.div
          initial={{ opacity: 0, y: -6, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: -6, height: 0 }}
          transition={{ duration: 0.24, ease: [0, 0, 0.2, 1] }}
          className="overflow-hidden"
        >
          <div
            className={`mb-3 flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm font-medium ${
              feedback.type === "success"
                ? "bg-[#1F8A4C]/10 text-[#1F8A4C]"
                : "bg-destructive/10 text-destructive"
            }`}
          >
            <span className="mt-0.5 shrink-0">{feedback.type === "success" ? "✓" : "✕"}</span>
            <span className="min-w-0 flex-1">
              {feedback.msg}
              {feedback.detail && (
                <code className="mt-1.5 block break-all rounded-md bg-black/5 px-2 py-1 font-mono text-[11px] font-normal opacity-90">
                  {feedback.detail}
                </code>
              )}
            </span>
            {/* Alvo de toque real: o glyph "×" solto era pequeno demais para o dedo. */}
            <button
              type="button"
              onClick={() => setFeedback(null)}
              aria-label={mlConfig.labels.closeFeedback}
              className="-my-1 -mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-current opacity-70 transition-opacity hover:bg-current/10 hover:opacity-100"
            >
              <X size={15} strokeWidth={2.5} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
