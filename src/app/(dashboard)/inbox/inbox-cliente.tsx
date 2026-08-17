"use client";

import { useState, useEffect, useTransition, useCallback, useRef } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, Loader2, Send, CheckCheck, Archive, Package, Search, RefreshCw, AlertCircle, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import {
  actionListarConversas,
  actionListarMensagens,
  actionEnviarMensagem,
  actionAvancarStatusConversa,
  actionSincronizarConversas,
} from "./actions";
import { ChannelLogo } from "@/shared/design-system/primitives/ChannelLogo";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { Sheet } from "@/shared/design-system/primitives/Sheet";
import { stagger, listItem } from "@/shared/design-system/motion-variants";
import pagesConfig from "@/config/pages.json";
import { useMobileViewport } from "./use-mobile-viewport";
import type { ConversaStatus } from "@/modules/inbox/domain/state-machine";

type Conversa = Awaited<ReturnType<typeof actionListarConversas>>[number];
type Mensagem = Awaited<ReturnType<typeof actionListarMensagens>>[number];
type FiltroStatus = "pendentes" | "resolvidas" | "todas";

const copy = pagesConfig.inbox;
const conversationCopy = copy.conversation;
const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

/* ── Helpers ─────────────────────────────────────────────── */
function formatarData(iso: Date | string): string {
  const d    = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000)     return "agora";
  if (diff < 3_600_000)  return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function iniciais(nome?: string | null, externalId?: string | null): string {
  if (nome) {
    const partes = nome.trim().split(/\s+/);
    return partes.length > 1
      ? (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
      : nome.slice(0, 2).toUpperCase();
  }
  if (!externalId) return "?";
  return externalId.slice(0, 2).toUpperCase();
}

function formatarPacote(externalId?: string | null): string {
  if (!externalId) return "Desconhecido";
  return externalId.startsWith("ml-pack:")
    ? `Pacote ${externalId.slice("ml-pack:".length)}`
    : externalId;
}

function formatarContato(c: {
  externalId?: string | null;
  clienteNome?: string | null;
  clienteNomeCompleto?: string | null;
  remetenteNome?: string | null;
}): string {
  return c.clienteNomeCompleto || c.clienteNome || c.remetenteNome || formatarPacote(c.externalId);
}

/* ── Animation variants ──────────────────────────────────── */
const msgIn = (saida: boolean) => ({
  initial: { opacity: 0, y: 6, scale: 0.95, x: saida ? 8 : -8 },
  animate: { opacity: 1, y: 0, scale: 1, x: 0 },
  transition: { duration: 0.2, ease: [0, 0, 0.2, 1] as [number,number,number,number] },
});

/* ── Avatar ───────────────────────────────────────────────── */
function ContactAvatar({ c, size = "md" }: { c: Conversa; size?: "sm" | "md" }) {
  const s  = size === "sm" ? "w-8 h-8 text-[11px]" : "w-10 h-10 text-xs";
  const ini = iniciais(c.clienteNomeCompleto || c.clienteNome || c.remetenteNome, c.externalId);
  return (
    <div
      className={`${s} rounded-full flex items-center justify-center font-bold flex-shrink-0 select-none`}
      style={{ background: "var(--gradient-signature)", color: "#fff" }}
    >
      {ini}
    </div>
  );
}

/* ── Status pill ─────────────────────────────────────────── */
function StatusPill({ status }: { status: string }) {
  const cfg = copy.status[status as keyof typeof copy.status];
  if (!cfg) return null;
  return (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
      style={{
        background: cfg.color + "20",
        color: cfg.color,
      }}
    >
      {cfg.label}
    </span>
  );
}


/* ── Main ────────────────────────────────────────────────── */
export function InboxCliente({ marcasAtivas, canaisAtivos, onContagens }: {
  marcasAtivas: ReadonlySet<string>;
  canaisAtivos: ReadonlySet<string>;
  onContagens: (valores: { marcas: Record<string, number>; canais: Record<string, number> }) => void;
}) {
  const [conversas, setConversas]     = useState<Conversa[]>([]);
  const [mensagens, setMensagens]     = useState<Mensagem[]>([]);
  const [selecionada, setSelecionada] = useState<Conversa | null>(null);
  const [loading, setLoading]         = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [erroCarregamento, setErroCarregamento] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [enviando, setEnviando]       = useState(false);
  const [texto, setTexto]             = useState("");
  const isMobile                      = useMobileViewport();
  const [busca, setBusca]             = useState("");
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>("pendentes");
  // Recolhido dá mais espaço pra área de mensagem quando a pessoa já sabe o
  // que quer ler/responder — some a lista, some o botão junto (fica só uma
  // tira fina com a seta de abrir de volta).
  const [recolhido, setRecolhido] = useState(false);
  const [, startTransition]           = useTransition();
  const textareaRef                   = useRef<HTMLTextAreaElement>(null);
  const msgEndRef                     = useRef<HTMLDivElement>(null);

  const carregarConversas = useCallback(async (sincronizar = true) => {
    setErroCarregamento(false);
    try {
      setConversas(await actionListarConversas());
    } catch {
      setErroCarregamento(true);
      toast.error(copy.messages.conversationsError);
      return;
    } finally {
      setLoading(false);
    }

    if (!sincronizar) return;
    setSincronizando(true);
    try {
      const { mensagensNovas } = await actionSincronizarConversas();
      if (mensagensNovas > 0) setConversas(await actionListarConversas());
    } catch (error) {
      console.error("[inbox] sincronização de conversas falhou", error);
    } finally {
      setSincronizando(false);
    }
  }, []);

  useEffect(() => {
    const task = window.setTimeout(() => void carregarConversas(), 0);
    return () => window.clearTimeout(task);
  }, [carregarConversas]);

  // Reporta as contagens por empresa/canal pra barra de escopo compartilhada
  // (que vive em page.tsx e soma com as outras abas) toda vez que a lista
  // de conversas muda.
  useEffect(() => {
    const marcasCount: Record<string, number> = {};
    const canaisCount: Record<string, number> = {};
    for (const c of conversas) {
      if (c.brandSlug) marcasCount[c.brandSlug] = (marcasCount[c.brandSlug] ?? 0) + 1;
      if (c.canalTipo) canaisCount[c.canalTipo] = (canaisCount[c.canalTipo] ?? 0) + 1;
    }
    onContagens({ marcas: marcasCount, canais: canaisCount });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversas]);

  const semFiltro = marcasAtivas.size === 0 && canaisAtivos.size === 0;

  const conversasFiltradas = conversas.filter((c) => {
    const encerrada = c.status === "resolvida" || c.status === "arquivada";
    if (filtroStatus === "pendentes" && encerrada) return false;
    if (filtroStatus === "resolvidas" && !encerrada) return false;
    if (marcasAtivas.size > 0 && !marcasAtivas.has(c.brandSlug ?? "")) return false;
    if (canaisAtivos.size > 0 && !canaisAtivos.has(c.canalTipo ?? "")) return false;
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    const pesquisavel = [
      formatarContato(c), c.produtoResumo, formatarPacote(c.externalId), c.ultimaMensagem?.conteudo,
    ].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
    if (termo && !pesquisavel.includes(termo)) return false;
    return true;
  });

  const totalPendentes = conversas.filter((c) => c.status !== "resolvida" && c.status !== "arquivada").length;
  const totalResolvidas = conversas.length - totalPendentes;

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
      toast.error(err instanceof Error ? err.message : copy.messages.sendError);
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
      const statusLabel = copy.status[novoStatus].label.toLocaleLowerCase("pt-BR");
      toast.success(conversationCopy.statusUpdated.replace("{status}", statusLabel));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : copy.messages.statusError);
    }
  }

  /* ── Loading ── */
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

  if (erroCarregamento) {
    return (
      <div className="rounded-[1.25rem] bg-card p-8 shadow-[0_2px_16px_rgba(14,15,19,.07)] text-center">
        <AlertCircle className="mx-auto mb-3 text-destructive" size={24} />
        <p className="font-semibold text-foreground">Não foi possível carregar as conversas</p>
        <p className="mt-1 text-sm text-muted-foreground">Verifique a conexão e tente novamente.</p>
        <button type="button" onClick={() => { setLoading(true); void carregarConversas(false); }} className="mt-4 min-h-11 rounded-xl border border-border px-4 text-sm font-semibold hover:bg-muted">
          Tentar novamente
        </button>
      </div>
    );
  }

  /* ── Sem filtro ── A busca já roda em segundo plano desde a entrada na
     página; só a lista fica escondida até uma marca ou canal ser escolhido. */
  if (semFiltro) {
    return (
      <div className="rounded-[1.25rem] bg-card shadow-[0_2px_16px_rgba(14,15,19,.07)]">
        <EmptyState
          illustration="funnel"
          title="Selecione um filtro"
          description="Escolha uma marca ou canal acima para ver as conversas."
        />
      </div>
    );
  }

  /* ── Empty ── */
  if (conversas.length === 0) {
    return (
      <div className="rounded-[1.25rem] bg-card shadow-[0_2px_16px_rgba(14,15,19,.07)]">
        <EmptyState
          illustration="conversation"
          title={copy.empty.title}
          description={
            <>
              {copy.empty.description}{" "}
              <span className="font-medium text-foreground">{copy.empty.destination}</span>.
            </>
          }
        />
      </div>
    );
  }

  const conversationContent = (
    <AnimatePresence mode="wait">

          {/* Empty state */}
          {!selecionada && (
            <motion.div
              key="placeholder"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground"
            >
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.08, type: "spring", stiffness: 260, damping: 22 }}
                className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center"
              >
                <MessageSquare size={22} strokeWidth={1.5} />
              </motion.div>
              <motion.p
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.14 }}
                className="text-sm"
              >
                {copy.selectConversation}
              </motion.p>
            </motion.div>
          )}

          {/* Loading messages */}
          {selecionada && loadingMsgs && (
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
          )}

          {/* Conversation view */}
          {selecionada && !loadingMsgs && (
            <motion.div
              key={selecionada.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="flex flex-col flex-1 overflow-hidden"
            >
              {/* Header */}
              <div className="px-4 py-3 border-b border-border flex items-center gap-3">
                <ContactAvatar c={selecionada} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {formatarContato(selecionada)}
                    </p>
                    {selecionada.canalTipo && (
                      <ChannelLogo canal={selecionada.canalTipo} size="xs" variant="logo" />
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <StatusPill status={selecionada.status} />
                  </div>
                  {(selecionada.clienteNomeCompleto || selecionada.clienteNome || selecionada.remetenteNome) && (
                    <p className="flex items-center gap-1 text-[11px] text-muted-foreground truncate mt-0.5">
                      <Package size={11} strokeWidth={2} className="flex-shrink-0 opacity-70" />
                      <span className="truncate">{selecionada.produtoResumo ?? formatarPacote(selecionada.externalId)}</span>
                    </p>
                  )}
                </div>

                {selecionada.status !== "resolvida" && selecionada.status !== "arquivada" && (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => avancarStatus("resolvida")}
                      className="flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-950 dark:hover:bg-emerald-900 transition-colors"
                    >
                      <CheckCheck size={13} strokeWidth={2.5} />
                      {conversationCopy.resolve}
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => avancarStatus("arquivada")}
                      className="flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      <Archive size={13} />
                      {conversationCopy.archive}
                    </motion.button>
                  </div>
                )}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-2 scrollbar-thin">
                {mensagens.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
                    <Package size={18} strokeWidth={1.5} />
                    <p className="text-xs">{copy.noMessages}</p>
                  </div>
                ) : (
                  [...mensagens].reverse().map((m, i) => {
                    const saida = m.direcao === "saida";
                    return (
                      <motion.div
                        key={m.id}
                        {...msgIn(saida)}
                        transition={{ delay: i * 0.025, duration: 0.2, ease: [0, 0, 0.2, 1] }}
                        className={`flex flex-col max-w-[70%] ${saida ? "ml-auto items-end" : "mr-auto items-start"}`}
                      >
                        <div
                          className={`px-3.5 py-2.5 text-sm leading-relaxed ${
                            saida
                              ? "rounded-[14px_4px_14px_14px] text-white shadow-[0_2px_12px_rgba(227,19,27,.22)]"
                              : "rounded-[4px_14px_14px_14px] bg-muted text-foreground border border-border/50"
                          }`}
                          style={saida ? { background: "var(--gradient-signature)" } : undefined}
                        >
                          {m.conteudo}
                        </div>
                        <p className={`text-[10px] mt-1 px-1 tabular-nums ${saida ? "text-muted-foreground" : "text-muted-foreground"}`}>
                          {formatarData(m.createdAt)}
                        </p>
                      </motion.div>
                    );
                  })
                )}
                <div ref={msgEndRef} />
              </div>

              {/* Reply input */}
              {selecionada.status !== "resolvida" && selecionada.status !== "arquivada" && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="px-4 py-3 border-t border-border flex items-end gap-2"
                >
                  <textarea
                    ref={textareaRef}
                    value={texto}
                    maxLength={350}
                    onChange={(e) => setTexto(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        enviar();
                      }
                    }}
                    rows={1}
                    placeholder={conversationCopy.replyPlaceholder}
                    className="flex-1 resize-none rounded-[10px] border border-border bg-muted/40 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[rgba(155,48,217,.5)] focus:shadow-[0_0_0_3px_rgba(155,48,217,.08)] transition-[border-color,box-shadow] max-h-28 overflow-y-auto leading-relaxed"
                  />
                  <span className="text-[10px] text-muted-foreground tabular-nums self-center">
                    {texto.length}/350
                  </span>
                  <motion.button
                    whileHover={{ scale: 1.06, y: -1 }}
                    whileTap={{ scale: 0.94 }}
                    onClick={enviar}
                    disabled={!texto.trim() || enviando}
                    className="h-11 w-11 flex-shrink-0 flex items-center justify-center rounded-[10px] text-white disabled:opacity-35 transition-shadow shadow-[0_4px_14px_rgba(227,19,27,.28)] disabled:shadow-none"
                    style={{ background: "var(--gradient-signature)" }}
                    title={conversationCopy.sendTitle}
                  >
                    {enviando ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} strokeWidth={2} />}
                  </motion.button>
                </motion.div>
              )}
            </motion.div>
          )}

    </AnimatePresence>
  );

  return (
    <div className="flex flex-col gap-4">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.26 }}
        className="flex h-[max(32rem,calc(100dvh-8.5rem))] max-h-[calc(100dvh-6rem)] gap-4"
      >
      {/* ── Conversation list — mais larga que antes (w-80 → w-[26rem]) para
          a caixa de conversas ocupar de fato a maior parte da tela, que era
          o pedido: essa lista é a informação principal da página, o painel
          de mensagens só se preenche depois que algo é selecionado. ── */}
      {(() => {
      // O botão de recolher só existe em telas lg; se a janela encolher com
      // o painel já recolhido, isMobile vira a fonte da verdade — sem isso,
      // a lista sumiria da tela no mobile sem nenhum jeito de trazer de volta.
      const efetivamenteRecolhido = recolhido && !isMobile;
      return (
      <div className={`w-full flex-shrink-0 flex-col overflow-hidden rounded-[1.25rem] bg-card shadow-[0_2px_16px_rgba(14,15,19,.07)] flex ${efetivamenteRecolhido ? "lg:w-14" : "lg:w-[26rem]"}`}>
        {efetivamenteRecolhido ? (
          <button
            type="button"
            onClick={() => setRecolhido(false)}
            title="Expandir painel de conversas"
            aria-label="Expandir painel de conversas"
            className="hidden h-14 w-14 flex-shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:flex"
          >
            <PanelLeftOpen size={17} />
          </button>
        ) : (
          <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground whitespace-nowrap">
                {conversasFiltradas.length} {conversasFiltradas.length === 1 ? conversationCopy.countSingular : conversationCopy.countPlural}
              </p>
              {conversas[0]?.updatedAt && (
                <p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                  <RefreshCw size={9} /> {dataHora.format(new Date(conversas[0].updatedAt))}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => void carregarConversas()} disabled={sincronizando} title="Atualizar conversas" aria-label="Atualizar conversas" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50">
                <RefreshCw size={14} className={sincronizando ? "animate-spin" : ""} />
              </button>
              <button type="button" onClick={() => setRecolhido(true)} title="Recolher painel de conversas" aria-label="Recolher painel de conversas" className="hidden h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground lg:flex">
                <PanelLeftClose size={14} />
              </button>
            </div>
          </div>
        )}

        {!efetivamenteRecolhido && <>
        <div className="flex gap-1 border-b border-border bg-muted/10 px-3 py-2">
          {([
            ["pendentes", "Pendentes", totalPendentes],
            ["resolvidas", "Resolvidas", totalResolvidas],
            ["todas", "Todas", conversas.length],
          ] as const).map(([valor, rotulo, total]) => (
            <button key={valor} type="button" onClick={() => setFiltroStatus(valor)} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${filtroStatus === valor ? "bg-selecionado text-white" : "text-muted-foreground hover:text-foreground"}`}>
              {rotulo} <span className="tabular-nums opacity-75">{total}</span>
            </button>
          ))}
        </div>

        <div className="px-3 py-2.5 border-b border-border">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar contato, produto ou mensagem…"
              className="w-full h-9 rounded-lg border border-border bg-muted/40 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[rgba(155,48,217,.5)] focus:shadow-[0_0_0_3px_rgba(155,48,217,.08)] transition-[border-color,box-shadow]"
            />
          </div>
        </div>

        <div className="overflow-y-auto flex-1 scrollbar-thin">
          {conversasFiltradas.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 py-12 text-muted-foreground">
              <Search size={18} strokeWidth={1.5} />
              <p className="text-xs">Nenhuma conversa encontrada com esse filtro.</p>
            </div>
          ) : (
          <motion.div variants={stagger} initial="hidden" animate="show">
            {conversasFiltradas.map((c) => (
              <motion.button
                key={c.id}
                variants={listItem}
                onClick={(e) => { e.currentTarget.blur(); abrirConversa(c); }}
                whileHover={{ backgroundColor: "rgba(0,0,0,0.025)" }}
                className={`w-full text-left px-4 py-3.5 border-b border-border last:border-0 relative flex items-start gap-3 transition-colors ${
                  selecionada?.id === c.id ? "bg-muted/50" : ""
                }`}
              >
                {/* Active pip */}
                <AnimatePresence>
                  {selecionada?.id === c.id && (
                    <motion.span
                      layoutId="inbox-active"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ type: "spring", stiffness: 400, damping: 36 }}
                      className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full"
                      style={{ background: "var(--gradient-signature)" }}
                    />
                  )}
                </AnimatePresence>

                {/* Channel logo or avatar */}
                <div className="relative flex-shrink-0 mt-0.5">
                  <ContactAvatar c={c} size="sm" />
                  {c.canalTipo && (
                    <span className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center w-4 h-4 rounded-full bg-white border border-border shadow-sm overflow-hidden">
                      <ChannelLogo canal={c.canalTipo} size="xs" variant="logo" />
                    </span>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-xs font-semibold text-foreground truncate">
                      {formatarContato(c)}
                    </p>
                    <span className="text-[11px] font-semibold text-foreground/70 flex-shrink-0 tabular-nums">
                      {formatarData(c.updatedAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <StatusPill status={c.status} />
                  </div>
                  {c.ultimaMensagem && (
                    <p className="mt-1 truncate text-[11px] text-muted-foreground">
                      {c.ultimaMensagem.direcao === "saida" ? "Você: " : ""}{c.ultimaMensagem.conteudo}
                    </p>
                  )}
                  {(c.clienteNomeCompleto || c.clienteNome || c.remetenteNome) && (
                    <p className="flex items-center gap-1 text-[10px] text-muted-foreground truncate mt-1">
                      <Package size={10} strokeWidth={2} className="flex-shrink-0 opacity-70" />
                      <span className="truncate">{c.produtoResumo ?? formatarPacote(c.externalId)}</span>
                    </p>
                  )}
                </div>
              </motion.button>
            ))}
          </motion.div>
          )}
        </div>
        </>}
      </div>
      );
      })()}

      {/* ── Message panel (desktop) ── */}
      <div className="hidden lg:flex flex-1 rounded-[1.25rem] bg-card shadow-[0_2px_16px_rgba(14,15,19,.07)] overflow-hidden flex-col">
        {conversationContent}
      </div>

      {/* ── Message sheet (mobile) — arrasta para fechar, projeta momentum ao soltar ──
           Só é montado em telas estreitas: mantê-lo montado (mesmo só escondido via CSS)
           no desktop faz o vaul tentar prender o foco num conteúdo com display:none, e o
           dismiss-layer interpreta isso como "perdeu o foco" e fecha o sheet na hora,
           derrubando a conversa selecionada logo após o clique. */}
      {isMobile && (
        <Sheet open={!!selecionada} onOpenChange={(open) => { if (!open) setSelecionada(null); }} className="h-[88dvh]">
          {conversationContent}
        </Sheet>
      )}
      </motion.div>
    </div>
  );
}
