"use client";

import { useCallback, useState } from "react";
import { motion } from "framer-motion";
import { InboxCliente } from "./inbox-cliente";
import { InboxPerguntas } from "./inbox-perguntas";
import { InboxAvaliacoes } from "./inbox-avaliacoes";
import { FiltroEscopoBar } from "./filtro-escopo";
import pagesConfig from "@/config/pages.json";
import { getIcon } from "@/shared/config/icon-registry";

type Aba = "conversas" | "perguntas" | "avaliacoes";
const copy = pagesConfig.inbox;
const ABAS = copy.tabs as Array<{ id: Aba; label: string; icon: string; hint?: string }>;

export default function InboxPage() {
  const [aba, setAba] = useState<Aba>("conversas");
  const [marcasAtivas, setMarcasAtivas] = useState<ReadonlySet<string>>(new Set());
  const [canaisAtivos, setCanaisAtivos] = useState<ReadonlySet<string>>(new Set());

  // Cada aba reporta suas próprias contagens por empresa/canal; a barra soma
  // as três — é um indicador de atividade agregada, não a contagem de uma
  // aba isolada (conversa, pergunta e anúncio são naturezas diferentes).
  const [contagens, setContagens] = useState<Record<Aba, { marcas: Record<string, number>; canais: Record<string, number> }>>({
    conversas: { marcas: {}, canais: {} },
    perguntas: { marcas: {}, canais: {} },
    avaliacoes: { marcas: {}, canais: {} },
  });

  const reportarContagens = useCallback((tab: Aba, valores: { marcas: Record<string, number>; canais: Record<string, number> }) => {
    setContagens((atual) => ({ ...atual, [tab]: valores }));
  }, []);

  function somarContagens(campo: "marcas" | "canais"): Record<string, number> {
    const soma: Record<string, number> = {};
    for (const tab of Object.values(contagens)) {
      for (const [chave, valor] of Object.entries(tab[campo])) {
        soma[chave] = (soma[chave] ?? 0) + valor;
      }
    }
    return soma;
  }

  function alternarMarca(slug: string) {
    setMarcasAtivas((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(slug)) proximo.delete(slug); else proximo.add(slug);
      return proximo;
    });
  }

  function alternarCanal(tipo: string) {
    setCanaisAtivos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(tipo)) proximo.delete(tipo); else proximo.add(tipo);
      return proximo;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Header + Tabs — compacto de propósito: a conversa é o conteúdo, não
          o cabeçalho, então título, filtro e abas dividem uma linha só sempre
          que a largura permitir, em vez de empilhar e comer altura útil. */}
      <div className="flex flex-nowrap items-center justify-start gap-2">
        {/* Barra de escopo única — vale pras três abas ao mesmo tempo, em vez
            de cada uma ter a sua. Rola por dentro em vez de quebrar linha,
            pra não empurrar a tab bar pra baixo em telas mais estreitas. */}
        <div className="min-w-0 overflow-x-auto scrollbar-thin">
          <FiltroEscopoBar
            marcasAtivas={marcasAtivas}
            canaisAtivos={canaisAtivos}
            onToggleMarca={alternarMarca}
            onToggleCanal={alternarCanal}
            contagemMarca={somarContagens("marcas")}
            contagemCanal={somarContagens("canais")}
          />
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 p-1 rounded-[0.875rem] bg-muted w-fit flex-shrink-0">
          {ABAS.map((a) => {
            const Icon = getIcon(a.icon);
            const active = aba === a.id;
            return (
              <motion.button
                key={a.id}
                onClick={() => setAba(a.id)}
                whileTap={{ scale: 0.97 }}
                className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-[0.625rem] text-[13px] font-medium transition-colors whitespace-nowrap"
                style={{ color: active ? "var(--foreground)" : "var(--muted-foreground)" }}
              >
                {active && (
                  <motion.span
                    layoutId="inbox-tab"
                    className="absolute inset-0 rounded-[0.625rem] bg-card shadow-[0_1px_4px_rgba(14,15,19,.10)]"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <Icon size={14} strokeWidth={active ? 2.25 : 1.75} className="relative z-10" />
                <span className="relative z-10">{a.label}</span>
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
          <InboxCliente
            marcasAtivas={marcasAtivas}
            canaisAtivos={canaisAtivos}
            onContagens={(valores) => reportarContagens("conversas", valores)}
          />
        </div>
        <div className={aba === "perguntas" ? "" : "hidden"}>
          <InboxPerguntas
            marcasAtivas={marcasAtivas}
            canaisAtivos={canaisAtivos}
            onContagens={(valores) => reportarContagens("perguntas", valores)}
          />
        </div>
        <div className={aba === "avaliacoes" ? "" : "hidden"}>
          <InboxAvaliacoes
            marcasAtivas={marcasAtivas}
            canaisAtivos={canaisAtivos}
            onContagens={(valores) => reportarContagens("avaliacoes", valores)}
          />
        </div>
      </motion.div>
    </div>
  );
}
