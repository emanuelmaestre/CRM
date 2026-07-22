"use client";

import { useState, useEffect, useTransition, useCallback, useRef } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, Loader2, Send, CheckCheck, Archive } from "lucide-react";
import {
  actionListarConversas,
  actionListarMensagens,
  actionEnviarMensagem,
  actionAvancarStatusConversa,
} from "./actions";
import pagesConfig from "@/config/pages.json";
import type { ConversaStatus } from "@/modules/inbox/domain/state-machine";

type Conversa = Awaited<ReturnType<typeof actionListarConversas>>[number];
type Mensagem = Awaited<ReturnType<typeof actionListarMensagens>>[number];

const copy = pagesConfig.inbox;

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
  const [enviando, setEnviando]       = useState(false);
  const [texto, setTexto]             = useState("");
  const [, startTransition]           = useTransition();
  const textareaRef                   = useRef<HTMLTextAreaElement>(null);
  const msgEndRef                     = useRef<HTMLDivElement>(null);

  const carregarConversas = useCallback(() => {
    startTransition(async () => {
      setLoading(true);
      try {
        setConversas(await actionListarConversas());
      } catch {
        toast.error(copy.messages.conversationsError);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  useEffect(() => { carregarConversas(); }, [carregarConversas]);

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens]);

  function abrirConversa(c: Conversa) {
    setSelecionada(c);
    setLoadingMsgs(true);
    startTransition(async () => {
      try {
        setMensagens(await actionListarMensagens(c.id));
      } catch {
        toast.error(copy.messages.messagesError);
      } finally {
        setLoadingMsgs(false);
      }
    });
  }

  async function enviar() {
    if (!selecionada || !texto.trim() || enviando) return;
    const conteudo = texto.trim();
    setTexto("");
    setEnviando(true);
    try {
      await actionEnviarMensagem(selecionada.id, conteudo);
      const msgs = await actionListarMensagens(selecionada.id);
      setMensagens(msgs);
      if (selecionada.status === "nova" || selecionada.status === "aguardando_cliente") {
        setSelecionada((s) => s ? { ...s, status: "em_atendimento" } : s);
        setConversas((cs) => cs.map((c) => c.id === selecionada.id ? { ...c, status: "em_atendimento" } : c));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar mensagem.");
      setTexto(conteudo);
    } finally {
      setEnviando(false);
      textareaRef.current?.focus();
    }
  }

  async function avancarStatus(novoStatus: ConversaStatus) {
    if (!selecionada) return;
    try {
      await actionAvancarStatusConversa(selecionada.id, novoStatus);
      setSelecionada((s) => s ? { ...s, status: novoStatus } : s);
      setConversas((cs) => cs.map((c) => c.id === selecionada.id ? { ...c, status: novoStatus } : c));
      toast.success(`Conversa ${novoStatus === "resolvida" ? "resolvida" : "arquivada"}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao avançar status.");
    }
  }

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground"
      >
        <Loader2 size={16} className="animate-spin" />
        {copy.loadingConversations}
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
          className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center text-muted-foreground mx-auto mb-4"
        >
          <MessageSquare size={24} strokeWidth={1.5} />
        </motion.div>
        <p className="text-sm font-semibold text-foreground mb-1">{copy.empty.title}</p>
        <p className="text-sm text-muted-foreground max-w-xs mx-auto">
          {copy.empty.description}{" "}
          <span className="font-medium text-foreground">{copy.empty.destination}</span>.
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
                  style={{
                    background: (copy.status[c.status as keyof typeof copy.status]?.color ?? "var(--muted-foreground)") + "20",
                    color: copy.status[c.status as keyof typeof copy.status]?.color ?? "var(--muted-foreground)",
                  }}
                >
                  {copy.status[c.status as keyof typeof copy.status]?.label ?? c.status}
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
              <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center">
                <MessageSquare size={20} strokeWidth={1.5} />
              </div>
              <span className="mt-1">{copy.selectConversation}</span>
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
              {copy.loadingMessages}
            </motion.div>
          ) : (
            <motion.div
              key={selecionada.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col flex-1 overflow-hidden"
            >
              {/* Header com controles de status */}
              <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {selecionada.externalId ?? selecionada.id.slice(0, 8)}
                  </p>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                    style={{
                      background: (copy.status[selecionada.status as keyof typeof copy.status]?.color ?? "var(--muted-foreground)") + "20",
                      color: copy.status[selecionada.status as keyof typeof copy.status]?.color ?? "var(--muted-foreground)",
                    }}
                  >
                    {copy.status[selecionada.status as keyof typeof copy.status]?.label ?? selecionada.status}
                  </span>
                </div>
                {selecionada.status !== "resolvida" && selecionada.status !== "arquivada" && (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => avancarStatus("resolvida")}
                      className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-950 dark:hover:bg-emerald-900 transition-colors"
                      title="Marcar como resolvida"
                    >
                      <CheckCheck size={13} />
                      Resolver
                    </button>
                    <button
                      onClick={() => avancarStatus("arquivada")}
                      className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      title="Arquivar conversa"
                    >
                      <Archive size={13} />
                      Arquivar
                    </button>
                  </div>
                )}
              </div>

              {/* Mensagens */}
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
                {mensagens.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center mt-auto mb-auto">{copy.noMessages}</p>
                ) : (
                  [...mensagens].reverse().map((m, i) => (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, y: 8, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ delay: i * 0.02, duration: 0.2, ease: [0, 0, 0.2, 1] }}
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
                <div ref={msgEndRef} />
              </div>

              {/* Reply input */}
              {selecionada.status !== "resolvida" && selecionada.status !== "arquivada" && (
                <div className="px-4 py-3 border-t border-border flex items-end gap-2">
                  <textarea
                    ref={textareaRef}
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        enviar();
                      }
                    }}
                    rows={1}
                    placeholder="Digite uma mensagem… (Enter para enviar)"
                    className="flex-1 resize-none rounded-[0.75rem] border border-border bg-muted/40 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)] transition-shadow max-h-28 overflow-y-auto"
                    style={{ lineHeight: "1.5" }}
                  />
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={enviar}
                    disabled={!texto.trim() || enviando}
                    className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-[0.75rem] text-white disabled:opacity-40 transition-opacity"
                    style={{ background: "var(--gradient-signature)" }}
                    title="Enviar (Enter)"
                  >
                    {enviando ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  </motion.button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
