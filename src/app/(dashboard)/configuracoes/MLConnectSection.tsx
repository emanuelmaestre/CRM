"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { AlertTriangle, ExternalLink, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { BrandLogo } from "@/shared/design-system/primitives/BrandLogo";
import settingsConfig from "@/config/settings.json";
import { isBrandSlug, type BrandSlug } from "@/shared/config/brands";

/** Espelha o retorno de /api/ml/status: booleano plano + detalhes por marca. */
type DetalheMarca = { conectado: boolean; sellerId?: string; contaConfere?: boolean };
type Status = (Partial<Record<BrandSlug, boolean>> & {
  detalhes?: Partial<Record<BrandSlug, DetalheMarca>>;
}) | null;
type Feedback = { type: "success" | "error"; brand?: string; msg: string; detail?: string };

const mlConfig = settingsConfig.mercadoLivre;
const labels = mlConfig.labels;

function getInitialFeedback(searchParams: { get(name: string): string | null }): Feedback | null {
  const connected = searchParams.get("ml_connected");
  const error = searchParams.get("ml_error");

  if (connected) {
    const brandLabel = mlConfig.brands.find((item) => item.slug === connected)?.label ?? connected;
    return {
      type: "success",
      brand: connected,
      msg: mlConfig.feedback.success.replace("{brand}", brandLabel),
    };
  }

  if (!error) return null;

  const errors = mlConfig.feedback.errors as Record<string, string>;
  return {
    type: "error",
    msg: errors[error] ?? `Erro: ${error}`,
    detail: searchParams.get("ml_detail") ?? undefined,
  };
}

export function MLConnectSection() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const pathname     = usePathname();

  const [status,        setStatus]        = useState<Status>(null);
  const [loading,       setLoading]       = useState(true);
  const [desconectando, setDesconectando] = useState<BrandSlug | null>(null);
  const [feedback,      setFeedback]      = useState<Feedback | null>(() => getInitialFeedback(searchParams));

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/ml/status");
      if (res.ok) setStatus(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // Remove os parâmetros do retorno OAuth depois de derivar o feedback inicial.
  useEffect(() => {
    const connected = searchParams.get("ml_connected");
    const error     = searchParams.get("ml_error");

    if (connected || error) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("ml_connected");
      params.delete("ml_error");
      params.delete("ml_detail");
      const qs = params.toString();
      router.replace(pathname + (qs ? `?${qs}` : ""));
    }
  }, [searchParams, router, pathname]);

  async function desconectar(slug: BrandSlug, label: string) {
    if (!window.confirm(labels.confirmDisconnect.replace("{brand}", label))) return;
    setDesconectando(slug);
    try {
      const res = await fetch(`/api/ml/disconnect?brand=${slug}`, { method: "POST" });
      if (!res.ok) throw new Error(labels.disconnect_error);
      toast.success(labels.disconnected_ok.replace("{brand}", label));
      setFeedback(null);
      await fetchStatus();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : labels.disconnect_error);
    } finally {
      setDesconectando(null);
    }
  }

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
          <span className="mt-0.5 shrink-0">
            {feedback.type === "success" ? "✓" : "✕"}
          </span>
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
            aria-label={labels.closeFeedback}
            className="-my-1 -mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-current opacity-70 transition-opacity hover:bg-current/10 hover:opacity-100"
          >
            <X size={15} strokeWidth={2.5} />
          </button>
        </motion.div>
      )}

      {mlConfig.brands.map(({ slug: rawSlug, label }) => {
        if (!isBrandSlug(rawSlug)) return null;
        const slug      = rawSlug;
        const connected = status?.[slug] ?? false;
        const detalhe   = status?.detalhes?.[slug];
        // contaConfere só vem quando ML_SELLER_ID_<MARCA> está configurado.
        const contaErrada = connected && detalhe?.contaConfere === false;
        const ocupado = desconectando === slug;

        return (
          <div key={slug} className="border-b border-border py-3 last:border-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <BrandLogo brand={slug} height={20} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{label}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {loading
                      ? labels.loading
                      : connected
                        ? `${labels.connected}${detalhe?.sellerId ? ` · ${labels.sellerPrefix} ${detalhe.sellerId}` : ""}`
                        : labels.disconnected}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {!loading && connected && (
                  <button
                    type="button"
                    onClick={() => { setLoading(true); void fetchStatus(); }}
                    title={labels.refresh}
                    aria-label={labels.refresh}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <RefreshCw size={13} strokeWidth={2} />
                  </button>
                )}

                {!loading && connected && (
                  <button
                    type="button"
                    onClick={() => desconectar(slug, label)}
                    disabled={ocupado}
                    className="rounded-lg border border-destructive/30 px-3 py-1.5 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
                  >
                    {ocupado ? labels.disconnecting : labels.disconnect}
                  </button>
                )}

                <motion.a
                  href={`/api/ml/connect?brand=${slug}`}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.97 }}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm"
                  style={{
                    background: connected ? "var(--muted)" : "#FFE600",
                    color:      connected ? "var(--muted-foreground)" : "#1a1a00",
                  }}
                >
                  {connected ? labels.reconnect : labels.connect}
                  <ExternalLink size={10} strokeWidth={2.5} />
                </motion.a>

                <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                  connected
                    ? "bg-[#1F8A4C]/10 text-[#1F8A4C]"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {connected
                    ? <><span className="inline-block h-1.5 w-1.5 rounded-full bg-[#1F8A4C]" /> {labels.active}</>
                    : labels.pending
                  }
                </span>
              </div>
            </div>

            {contaErrada && (
              <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-[#B57A00]/10 px-2.5 py-2 text-[11px] font-medium text-[#B57A00]">
                <AlertTriangle size={13} strokeWidth={2} className="mt-px shrink-0" />
                <span>{labels.mismatch}</span>
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
