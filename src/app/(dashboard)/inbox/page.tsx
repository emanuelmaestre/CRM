"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Info as InfoIcon } from "lucide-react";
import { InboxCliente } from "./inbox-cliente";
import { InboxPerguntas } from "./inbox-perguntas";
import { InboxAvaliacoes } from "./inbox-avaliacoes";
import pagesConfig from "@/config/pages.json";
import { getIcon } from "@/shared/config/icon-registry";

type Aba = "conversas" | "perguntas" | "avaliacoes";
const copy = pagesConfig.inbox;
const ABAS = copy.tabs as Array<{ id: Aba; label: string; icon: string; hint?: string }>;

export default function InboxPage() {
  const [aba, setAba] = useState<Aba>("conversas");

  return (
    <div className="flex flex-col gap-5">
      {/* Header + Tabs */}
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "var(--font-sora)" }}>
            {copy.title}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {copy.pageDescription}
          </p>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 p-1 rounded-[0.875rem] bg-muted w-fit">
          {ABAS.map((a) => {
            const Icon = getIcon(a.icon);
            const active = aba === a.id;
            return (
              <motion.button
                key={a.id}
                onClick={() => setAba(a.id)}
                whileTap={{ scale: 0.97 }}
                className="relative flex items-center gap-2 px-4 py-2 rounded-[0.625rem] text-sm font-medium transition-colors"
                style={{ color: active ? "var(--foreground)" : "var(--muted-foreground)" }}
              >
                {active && (
                  <motion.span
                    layoutId="inbox-tab"
                    className="absolute inset-0 rounded-[0.625rem] bg-card shadow-[0_1px_4px_rgba(14,15,19,.10)]"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <Icon size={15} strokeWidth={active ? 2.25 : 1.75} className="relative z-10" />
                <span className="relative z-10">{a.label}</span>
                {a.hint && (
                  <span
                    role="img"
                    aria-label={a.hint}
                    title={a.hint}
                    className="relative z-10 opacity-50 hover:opacity-100 transition-opacity"
                  >
                    <InfoIcon size={12} strokeWidth={2} />
                  </span>
                )}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Conteúdo da aba — as três ficam montadas desde a entrada na página,
          cada uma disparando sua própria busca em paralelo; só escondemos
          via CSS a que não está ativa, então trocar de aba não tem espera. */}
      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: [0, 0, 0.2, 1] }}>
        <div className={aba === "conversas" ? "" : "hidden"}>
          <InboxCliente />
        </div>
        <div className={aba === "perguntas" ? "" : "hidden"}>
          <InboxPerguntas />
        </div>
        <div className={aba === "avaliacoes" ? "" : "hidden"}>
          <InboxAvaliacoes />
        </div>
      </motion.div>
    </div>
  );
}
