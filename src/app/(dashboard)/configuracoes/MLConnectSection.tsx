"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { ExternalLink, RefreshCw } from "lucide-react";
import { BrandLogo } from "@/shared/design-system/primitives/BrandLogo";

type Status = { karzi: boolean; wuwu: boolean } | null;

const BRANDS: { slug: "karzi" | "wuwu"; label: string }[] = [
  { slug: "karzi", label: "KARZI" },
  { slug: "wuwu",  label: "WUWU"  },
];

export function MLConnectSection() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const pathname     = usePathname();

  const [status,    setStatus]    = useState<Status>(null);
  const [loading,   setLoading]   = useState(true);
  const [feedback,  setFeedback]  = useState<{ type: "success" | "error"; brand?: string; msg: string; detail?: string } | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ml/status");
      if (res.ok) setStatus(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // Lê feedback de redirect OAuth
  useEffect(() => {
    const connected = searchParams.get("ml_connected");
    const error     = searchParams.get("ml_error");

    if (connected) {
      setFeedback({ type: "success", brand: connected, msg: `Mercado Livre (${connected.toUpperCase()}) conectado com sucesso!` });
      fetchStatus();
    } else if (error) {
      const msgs: Record<string, string> = {
        state_mismatch:      "Falha de segurança (state inválido). Tente novamente.",
        token_exchange_failed: "Erro ao trocar o código por token. Tente novamente.",
        db_failed:           "Erro ao salvar o token. Contate o suporte.",
        missing_params:      "Parâmetros ausentes no retorno do ML.",
        invalid_brand:       "Marca inválida no retorno do ML.",
      };
      // O ML devolve o motivo real em ml_detail; sem ele o erro é indiagnosticável.
      const detail = searchParams.get("ml_detail");
      setFeedback({
        type: "error",
        msg: msgs[error] ?? `Erro: ${error}`,
        detail: detail ?? undefined,
      });
    }

    if (connected || error) {
      // Remove os query params sem recarregar
      const params = new URLSearchParams(searchParams.toString());
      params.delete("ml_connected");
      params.delete("ml_error");
      params.delete("ml_detail");
      const qs = params.toString();
      router.replace(pathname + (qs ? `?${qs}` : ""));
    }
  }, [searchParams, router, pathname, fetchStatus]);

  return (
    <div className="space-y-3">
      {feedback && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className={`flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm font-medium ${
            feedback.type === "success"
              ? "bg-[#1F8A4C]/10 text-[#1F8A4C]"
              : "bg-destructive/10 text-destructive"
          }`}
        >
          <span className="mt-0.5">
            {feedback.type === "success" ? "✓" : "✕"}
          </span>
          <span className="min-w-0">
            {feedback.msg}
            {feedback.detail && (
              <code className="mt-1.5 block break-all rounded-md bg-black/5 px-2 py-1 font-mono text-[11px] font-normal opacity-90">
                {feedback.detail}
              </code>
            )}
          </span>
          <button
            onClick={() => setFeedback(null)}
            className="ml-auto text-current opacity-60 hover:opacity-100"
            aria-label="Fechar"
          >
            ×
          </button>
        </motion.div>
      )}

      {BRANDS.map(({ slug, label }) => {
        const connected = status?.[slug] ?? false;
        return (
          <div
            key={slug}
            className="flex items-center justify-between py-3 border-b border-border last:border-0"
          >
            <div className="flex items-center gap-3">
              <BrandLogo brand={slug} height={20} />
              <div>
                <p className="text-sm font-medium text-foreground">{label}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {loading ? "Verificando…" : connected ? "Token ativo" : "Não conectado"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!loading && connected && (
                <button
                  onClick={fetchStatus}
                  title="Atualizar status"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <RefreshCw size={13} strokeWidth={2} />
                </button>
              )}

              <motion.a
                href={`/api/ml/connect?brand=${slug}`}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-semibold shadow-sm"
                style={{
                  background: connected ? "var(--muted)" : "#FFE600",
                  color:      connected ? "var(--muted-foreground)" : "#1a1a00",
                }}
              >
                {connected ? "Reconectar" : "Conectar"}
                <ExternalLink size={10} strokeWidth={2.5} />
              </motion.a>

              <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
                connected
                  ? "bg-[#1F8A4C]/10 text-[#1F8A4C]"
                  : "bg-muted text-muted-foreground"
              }`}>
                {connected
                  ? <><span className="w-1.5 h-1.5 rounded-full bg-[#1F8A4C] inline-block" /> Ativo</>
                  : "Pendente"
                }
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
