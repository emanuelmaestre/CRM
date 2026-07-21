"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, Loader2 } from "lucide-react";
import { actionListarConversas, actionListarMensagens } from "./actions";

type Conversa = Awaited<ReturnType<typeof actionListarConversas>>[number];
type Mensagem = Awaited<ReturnType<typeof actionListarMensagens>>[number];

const STATUS_LABEL: Record<string, string> = {
  nova: "Nova", em_atendimento: "Em atendimento",
  aguardando_cliente: "Aguardando", resolvida: "Resolvida", arquivada: "Arquivada",
};

const STATUS_COLOR: Record<string, string> = {
  nova: "#E3131B", em_atendimento: "#9B30D9",
  aguardando_cliente: "#F59E0B", resolvida: "#10B981",
  arquivada: "var(--muted-foreground)",
};

function formatarData(iso: Date | string): string {
  const d    = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000)     return "agora";
  if (diff < 3_600_000)  return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function InboxCliente() {
  const [conversas, setConversas]     = useState<Conversa[]>([]);
  const [mensagens, setMensagens]     = useState<Mensagem[]>([]);
  const [selecionada, setSelecionada] = useState<Conversa | null>(null);
  const [loading, setLoading]         = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [, startTransition]           = useTransition();

  const carregarConversas = useCallback(() => {
    startTransition(async () => {
      setLoading(true);
      try {
        setConversas(await actionListarConversas());
      } catch {
        toast.error("Erro ao carregar conversas.");
      } finally {
        setLoading(false);
      }
    });
  }, []);

  useEffect(() => { carregarConversas(); }, [carregarConversas]);

  function abrirConversa(c: Conversa) {
    setSelecionada(c);
    setLoadingMsgs(true);
    startTransition(async () => {
      try {
        setMensagens(await actionListarMensagens(c.id));
      } catch {
        toast.error("Erro ao carregar mensagens.");
      } finally {
        setLoadingMsgs(false);
      }
    });
  }

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground"
      >
        <Loader2 size={16} className="animate-spin" />
        Carregando conversas…
      </motion.div>
    );
  }

  if (conversas.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-[1.25rem] bg-card shadow-[0_2px_16px_rgba(14,15,19,.07)] p-10 text-center"
      >
        <motion.div
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
          className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center text-muted-foreground mx-auto mb-4"
        >
          <MessageSquare size={24} strokeWidth={1.5} />
        </motion.div>
        <p className="text-sm font-semibold text-foreground mb-1">Nenhuma conversa ainda</p>
        <p className="text-sm text-muted-foreground max-w-xs mx-auto">
          As mensagens chegam aqui assim que os conectores forem ativados em{" "}
          <span className="font-medium text-foreground">Configurações → Integrações</span>.
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex gap-4 h-[calc(100vh-10rem)]"
    >
      {/* Lista de conversas */}
      <div className="w-80 flex-shrink-0 rounded-[1.25rem] bg-card shadow-[0_2px_16px_rgba(14,15,19,.07)] overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-sm font-semibold text-foreground">
            {conversas.length} conversa{conversas.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="overflow-y-auto flex-1">
          {conversas.map((c, i) => (
            <motion.button
              key={c.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04, duration: 0.25 }}
              onClick={() => abrirConversa(c)}
              whileHover={{ backgroundColor: "rgba(0,0,0,0.025)" }}
              className={`w-full text-left px-4 py-3 border-b border-border last:border-0 transition-colors relative ${
                selecionada?.id === c.id ? "bg-muted" : ""
              }`}
            >
              {selecionada?.id === c.id && (
                <motion.span
                  layoutId="inbox-active"
                  className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full"
                  style={{ background: "var(--gradient-signature)" }}
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                />
              )}
              <div className="flex items-center justify-between gap-2 mb-1">
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                  style={{ background: STATUS_COLOR[c.status] + "20", color: STATUS_COLOR[c.status] }}
                >
                  {STATUS_LABEL[c.status] ?? c.status}
                </span>
                <span className="text-[10px] text-muted-foreground flex-shrink-0">
                  {formatarData(c.updatedAt)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate">{c.externalId ?? c.id.slice(0, 8)}</p>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Painel de mensagens */}
      <div className="flex-1 rounded-[1.25rem] bg-card shadow-[0_2px_16px_rgba(14,15,19,.07)] overflow-hidden flex flex-col">
        <AnimatePresence mode="wait">
          {!selecionada ? (
            <motion.div
              key="placeholder"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground"
            >
              <motion.div
                animate={{ y: [0, -5, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center"
              >
                <MessageSquare size={20} strokeWidth={1.5} />
              </motion.div>
              <span className="mt-1">Selecione uma conversa</span>
            </motion.div>
          ) : loadingMsgs ? (
            <motion.div
              key="loading-msgs"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex items-center justify-center gap-2 text-sm text-muted-foreground"
            >
              <Loader2 size={16} className="animate-spin" />
              Carregando mensagens…
            </motion.div>
          ) : (
            <motion.div
              key={selecionada.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col flex-1 overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-border">
                <p className="text-sm font-semibold text-foreground">
                  {selecionada.externalId ?? selecionada.id.slice(0, 8)}
                </p>
              </div>
              <div className="flex-1 overflow-y-auto p-4 flex flex-col-reverse gap-2">
                {mensagens.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center">Sem mensagens ainda.</p>
                ) : (
                  [...mensagens].reverse().map((m, i) => (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, y: 8, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ delay: i * 0.03, duration: 0.2 }}
                      className={`max-w-[70%] rounded-[0.75rem] px-3 py-2 text-sm ${
                        m.direcao === "saida"
                          ? "ml-auto text-white shadow-[0_2px_12px_rgba(227,19,27,.25)]"
                          : "mr-auto bg-muted text-foreground"
                      }`}
                      style={m.direcao === "saida" ? { background: "var(--gradient-signature)" } : undefined}
                    >
                      <p>{m.conteudo}</p>
                      <p className={`text-[10px] mt-1 ${m.direcao === "saida" ? "text-white/70 text-right" : "text-muted-foreground"}`}>
                        {formatarData(m.createdAt)}
                      </p>
                    </motion.div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
