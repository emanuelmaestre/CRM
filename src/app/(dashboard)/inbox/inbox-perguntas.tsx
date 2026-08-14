"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Filter, HelpCircle, Send, CheckCircle2, Loader2, GripVertical, Package, Zap } from "lucide-react";
import { stagger, listItem as cardVariant } from "@/shared/design-system/motion-variants";
import { SkeletonRow } from "@/shared/design-system/primitives/Skeleton";
import { ChannelLogo } from "@/shared/design-system/primitives/ChannelLogo";
import { actionListarPerguntas, actionResponderPergunta } from "./actions";
import pagesConfig from "@/config/pages.json";

type Plataforma = "mercadolivre";
type Status = "pendente" | "respondida";
/** Copy e limites por plataforma. A logo NÃO vem daqui: quem resolve é o
 *  ChannelLogo, a partir de channels.json (fonte única das identidades visuais). */
type PlatformConfig = {
  label: string;
  shortLabel: string;
  stripe: string;
  charLimit: number;
  quickReplies: string[];
};

type Pergunta = {
  id: string;
  plataforma: Plataforma;
  brandSlug: string | null;
  produto: string;
  pergunta: string;
  cliente: string;
  tempo: string;
  horasAtras: number;
  status: Status;
  resposta?: string;
};

const copy = pagesConfig.inbox.questions;
const PLAT = copy.platforms as Record<Plataforma, PlatformConfig>;

function normalizarPlataforma(canal: string): Plataforma {
  void canal;
  return "mercadolivre";
}

function formatarTempo(data: Date | string): { tempo: string; horasAtras: number } {
  const horas = (Date.now() - new Date(data).getTime()) / 3_600_000;
  if (horas < 1) return { tempo: `${Math.max(1, Math.round(horas * 60))}min`, horasAtras: horas };
  if (horas < 24) return { tempo: `${Math.round(horas)}h`, horasAtras: horas };
  return { tempo: `${Math.round(horas / 24)}d`, horasAtras: horas };
}

function mapearPergunta(item: Awaited<ReturnType<typeof actionListarPerguntas>>[number]): Pergunta {
  const { tempo, horasAtras } = formatarTempo(item.criadoEm);
  return {
    id: item.id,
    plataforma: normalizarPlataforma(item.canal),
    brandSlug: item.brandSlug,
    produto: item.produto,
    pergunta: item.pergunta,
    cliente: item.cliente,
    tempo,
    horasAtras,
    status: item.status,
    resposta: item.resposta ?? undefined,
  };
}

function urgency(h: number, status: Status): "urgent" | "normal" | "ok" {
  if (status === "respondida") return "ok";
  if (h >= 6)  return "urgent";
  return "normal";
}

const URGENCY_COLOR = copy.urgencyColors;

/* ── Main ──────────────────────────────────────────────── */
export function InboxPerguntas({ marcasAtivas, canaisAtivos, onContagens }: {
  marcasAtivas: ReadonlySet<string>;
  canaisAtivos: ReadonlySet<string>;
  onContagens: (valores: { marcas: Record<string, number>; canais: Record<string, number> }) => void;
}) {
  const [filtroStatus, setFiltroStatus] = useState<Status | "todos">("todos");
  const [selecionada, setSelecionada]   = useState<Pergunta | null>(null);
  const [atalhosAbertos, setAtalhosAbertos] = useState(false);
  const [resposta, setResposta]         = useState("");
  const [enviando, setEnviando]         = useState(false);
  const [perguntas, setPerguntas]       = useState<Pergunta[]>([]);
  const [carregando, setCarregando]     = useState(true);

  // Sidebar resize — plataforma e empresa agora filtram pela barra de escopo
  // compartilhada (page.tsx), então o que sobrou aqui é só a largura.
  const [sideWidth, setSideWidth] = useState(304);
  const dragState = useRef<{ startX: number; startW: number } | null>(null);

  const carregarPerguntas = useCallback(() => {
    actionListarPerguntas()
      .then((itens) => setPerguntas(itens.map(mapearPergunta)))
      .catch(() => toast.error(copy.loadError ?? "Não foi possível carregar as perguntas."))
      .finally(() => setCarregando(false));
  }, []);

  useEffect(() => { carregarPerguntas(); }, [carregarPerguntas]);

  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    dragState.current = { startX: e.clientX, startW: sideWidth };

    const onMove = (ev: MouseEvent) => {
      if (!dragState.current) return;
      const newW = Math.min(520, Math.max(200, dragState.current.startW + (ev.clientX - dragState.current.startX)));
      setSideWidth(newW);
    };
    const onUp = () => {
      dragState.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // Reporta as contagens pra barra de escopo compartilhada (page.tsx), que
  // soma com as outras abas. Perguntas só existe pro canal Mercado Livre por
  // enquanto, então o total de canal cai inteiro em "mercadolivre".
  useEffect(() => {
    const marcasCount: Record<string, number> = {};
    for (const p of perguntas) {
      if (p.brandSlug) marcasCount[p.brandSlug] = (marcasCount[p.brandSlug] ?? 0) + 1;
    }
    onContagens({ marcas: marcasCount, canais: { mercadolivre: perguntas.length } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perguntas]);

  const semFiltro = marcasAtivas.size === 0 && canaisAtivos.size === 0;

  const filtradas = perguntas.filter((p) => {
    if (filtroStatus !== "todos" && p.status !== filtroStatus) return false;
    if (marcasAtivas.size > 0 && !marcasAtivas.has(p.brandSlug ?? "")) return false;
    if (canaisAtivos.size > 0 && !canaisAtivos.has("mercadolivre")) return false;
    return true;
  });

  const limit = selecionada
    ? PLAT[selecionada.plataforma].charLimit
    : Math.max(...Object.values(PLAT).map((platform) => platform.charLimit));
  const charPct = resposta.length / limit;

  async function enviarResposta() {
    if (!selecionada || !resposta.trim() || enviando) return;
    const texto = resposta.trim();
    setEnviando(true);
    try {
      await actionResponderPergunta(selecionada.id, texto);
      setPerguntas((prev) =>
        prev.map((p) => p.id === selecionada.id ? { ...p, status: "respondida", resposta: texto } : p)
      );
      setSelecionada((prev) => prev ? { ...prev, status: "respondida", resposta: texto } : null);
      setResposta("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível registrar a resposta.");
    } finally {
      setEnviando(false);
    }
  }

  function usarChip(texto: string) {
    setResposta(texto);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0, 0, 0.2, 1] }}
      className="flex h-[max(32rem,calc(100dvh-13rem))] max-h-[calc(100dvh-7rem)] gap-3"
    >
      {/* ── Sidebar ── */}
      <motion.div
        style={{ width: sideWidth, flexShrink: 0 }}
        className="relative rounded-[1.25rem] bg-card shadow-[0_2px_16px_rgba(14,15,19,.07)] overflow-hidden flex flex-col"
      >
            {/* Status filter row */}
            <div className="flex gap-1 px-3 py-2 border-b border-border bg-muted/10">
              {(["todos", "pendente", "respondida"] as const).map((s) => (
                <motion.button
                  key={s}
                  onClick={() => setFiltroStatus(s)}
                  whileTap={{ scale: 0.96 }}
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors ${
                    filtroStatus === s
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {copy.statusFilters[s]}
                </motion.button>
              ))}
            </div>


            {/* Card list */}
            <div className="overflow-y-auto flex-1 scrollbar-thin">
              <AnimatePresence initial={false}>
                {carregando ? (
                  <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="divide-y divide-border">
                    <SkeletonRow /><SkeletonRow /><SkeletonRow />
                  </motion.div>
                ) : semFiltro ? (
                  <motion.div
                    key="sem-filtro"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="flex flex-col items-center justify-center py-12 text-center px-4"
                  >
                    <Filter size={24} strokeWidth={1.5} className="text-muted-foreground mb-2" />
                    <p className="text-sm font-semibold text-foreground">Selecione um filtro</p>
                    <p className="mt-1 text-xs text-muted-foreground">Escolha uma marca ou canal acima para ver as perguntas.</p>
                  </motion.div>
                ) : filtradas.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="flex flex-col items-center justify-center py-12 text-center px-4"
                  >
                    <HelpCircle size={24} strokeWidth={1.5} className="text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">{copy.empty}</p>
                  </motion.div>
                ) : (
                  <motion.div variants={stagger} initial="hidden" animate="show">
                    {filtradas.map((p) => {
                      const urg = urgency(p.horasAtras, p.status);
                      const isActive = selecionada?.id === p.id;
                      const isAnswered = p.status === "respondida";
                      return (
                        <motion.button
                          key={p.id}
                          variants={cardVariant}
                          onClick={() => { setSelecionada(p); setResposta(""); setAtalhosAbertos(false); }}
                          className={`w-full text-left border-b border-border last:border-0 relative flex items-stretch transition-colors ${
                            isActive ? "bg-muted/60" : "hover:bg-muted/30"
                          } ${isAnswered ? "opacity-55" : ""}`}
                        >
                          {/* Active pip */}
                          <AnimatePresence>
                            {isActive && (
                              <motion.span
                                layoutId="pergunta-pip"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ type: "spring", stiffness: 400, damping: 36 }}
                                className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full z-10"
                                style={{ background: "var(--gradient-signature)" }}
                              />
                            )}
                          </AnimatePresence>

                          {/* Platform colour stripe */}
                          <span
                            className="w-[3px] flex-shrink-0 self-stretch rounded-l-none"
                            style={{
                              background: PLAT[p.plataforma].stripe,
                              opacity: isAnswered ? 0.35 : 1,
                            }}
                          />

                          {/* Body */}
                          <span className="flex-1 min-w-0 px-3 py-2.5">
                            <span className="flex items-center justify-between gap-2 mb-1">
                              <span className="text-[12px] font-bold text-foreground truncate">
                                {p.cliente}
                              </span>
                              <span className="flex items-center gap-1 flex-shrink-0">
                                <motion.span
                                  animate={urg === "urgent" && !isAnswered ? {
                                    scale: [1, 1.3, 1],
                                    opacity: [1, 0.6, 1],
                                  } : {}}
                                  transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                  style={{ background: URGENCY_COLOR[urg] }}
                                />
                                <span className="text-[10px] text-muted-foreground tabular-nums">{p.tempo}</span>
                              </span>
                            </span>
                            <span className="flex items-start gap-1 text-[10px] font-semibold uppercase tracking-[.04em] text-muted-foreground">
                              <Package size={10} strokeWidth={2} className="flex-shrink-0 opacity-70 mt-[1px]" />
                              <span className="leading-snug">{p.produto}</span>
                            </span>
                          </span>
                        </motion.button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Drag-to-resize handle */}
            <div
              onMouseDown={startResize}
              className="absolute right-0 top-0 bottom-0 w-3 flex items-center justify-center cursor-col-resize group z-20"
              title={copy.actions.resize}
            >
              <div className="w-[3px] h-10 rounded-full bg-border group-hover:bg-[rgba(155,48,217,.4)] transition-colors" />
              <GripVertical
                size={10}
                strokeWidth={2}
                className="absolute text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
              />
            </div>
      </motion.div>

      {/* ── Right panel ── */}
      <div className="flex-1 rounded-[1.25rem] bg-card shadow-[0_2px_16px_rgba(14,15,19,.07)] overflow-hidden flex flex-col min-w-0">
        <AnimatePresence mode="wait">
          {!selecionada ? (
            <motion.div
              key="vazio"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground"
            >
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.08, type: "spring", stiffness: 260, damping: 22 }}
                className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center"
              >
                <HelpCircle size={22} strokeWidth={1.5} />
              </motion.div>
              <motion.p
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.14, duration: 0.2 }}
                className="text-sm"
              >
                {copy.select}
              </motion.p>
            </motion.div>
          ) : (
            <motion.div
              key={selecionada.id}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="flex flex-col flex-1 overflow-hidden"
            >
              {/* Context header */}
              <div className="px-5 py-4 border-b border-border flex items-center gap-3">
                <motion.span
                  initial={{ scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 24 }}
                  className="flex items-center justify-center h-8 px-3 rounded-full bg-white border border-black/8 shadow-[0_1px_4px_rgba(0,0,0,.06)] flex-shrink-0"
                >
                  <ChannelLogo canal={selecionada.plataforma} size="xs" variant="logo" />
                </motion.span>

                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-bold text-foreground truncate leading-tight">
                    {selecionada.cliente}
                  </p>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground mt-1 truncate">
                    <Package size={11} strokeWidth={2} className="flex-shrink-0 opacity-70" />
                    <span className="truncate">{selecionada.produto}</span>
                  </p>
                </div>

                <span className="text-[11px] text-muted-foreground tabular-nums flex-shrink-0">
                  {selecionada.tempo} {copy.ago}
                </span>
              </div>

              {/* Stage area */}
              <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5 scrollbar-thin">
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.06, duration: 0.22, ease: [0, 0, 0.2, 1] }}
                >
                  <p className="text-[10px] font-bold uppercase tracking-[.08em] text-muted-foreground mb-2">
                    {copy.question}
                  </p>
                  <div className="rounded-[4px_14px_14px_14px] border border-border bg-muted/40 px-4 py-3.5 text-[15px] text-foreground leading-relaxed max-w-[78%]">
                    {selecionada.pergunta}
                  </div>
                </motion.div>

                {selecionada.resposta && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1, duration: 0.22, ease: [0, 0, 0.2, 1] }}
                    className="flex flex-col items-end gap-2"
                  >
                    <p className="text-[10px] font-bold uppercase tracking-[.08em] text-muted-foreground">
                      {copy.yourAnswer}
                    </p>
                    <div
                      className="rounded-[14px_4px_14px_14px] px-4 py-3.5 text-sm text-white leading-relaxed max-w-[78%] shadow-[0_3px_14px_rgba(227,19,27,.22)]"
                      style={{ background: "var(--gradient-signature)" }}
                    >
                      {selecionada.resposta}
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Respondida footer */}
              {selecionada.status === "respondida" && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="px-5 py-3 border-t border-border flex items-center gap-1.5"
                >
                  <CheckCircle2 size={13} strokeWidth={2} className="text-[#1F8A4C]" />
                  <p className="text-xs text-[#1F8A4C] font-medium">{copy.answered}</p>
                </motion.div>
              )}

              {/* Reply dock */}
              {selecionada.status === "pendente" && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1, duration: 0.2 }}
                  className="border-t border-border px-4 py-4 flex flex-col gap-3"
                >
                  {/* Textarea row */}
                  <div className="flex items-end gap-2">
                    {/* Atalho de respostas rápidas — mesmo lugar/gesto do
                        clipe do WhatsApp: fica ao lado do campo, some quando
                        não está em uso, e não empurra o layout do resto do
                        dock pra baixo toda vez que a conversa muda. */}
                    <div className="relative flex-shrink-0">
                      <motion.button
                        type="button"
                        onClick={() => setAtalhosAbertos((v) => !v)}
                        whileHover={{ scale: 1.06 }}
                        whileTap={{ scale: 0.94 }}
                        title={copy.quickReply}
                        aria-label={copy.quickReply}
                        aria-expanded={atalhosAbertos}
                        className={`w-10 h-10 rounded-[10px] flex items-center justify-center transition-colors ${
                          atalhosAbertos
                            ? "text-[#9B30D9] bg-[rgba(155,48,217,.1)]"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted"
                        }`}
                      >
                        <Zap size={17} strokeWidth={2} />
                      </motion.button>

                      <AnimatePresence>
                        {atalhosAbertos && (
                          <>
                            <motion.div
                              key="backdrop"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              className="fixed inset-0 z-40"
                              onClick={() => setAtalhosAbertos(false)}
                            />
                            <motion.div
                              key="menu"
                              initial={{ opacity: 0, y: 6, scale: 0.97 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 6, scale: 0.97 }}
                              transition={{ duration: 0.15 }}
                              className="absolute bottom-full left-0 z-50 mb-2 w-64 rounded-[0.875rem] border border-border bg-card p-2 shadow-[0_8px_24px_rgba(14,15,19,.14)]"
                            >
                              <p className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-[.07em] text-muted-foreground">
                                {copy.quickReply}
                              </p>
                              <div className="flex flex-col gap-0.5">
                                {PLAT[selecionada.plataforma].quickReplies.map((chip) => (
                                  <button
                                    key={chip}
                                    type="button"
                                    onClick={() => { usarChip(chip); setAtalhosAbertos(false); }}
                                    className="rounded-lg px-2.5 py-1.5 text-left text-[12px] leading-snug text-foreground transition-colors hover:bg-[rgba(155,48,217,.08)]"
                                  >
                                    {chip}
                                  </button>
                                ))}
                              </div>
                            </motion.div>
                          </>
                        )}
                      </AnimatePresence>
                    </div>

                    <textarea
                      className="flex-1 resize-none rounded-[10px] border border-border bg-muted/30 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[rgba(155,48,217,.5)] focus:shadow-[0_0_0_3px_rgba(155,48,217,.08)] transition-[border-color,box-shadow] min-h-[62px] max-h-[120px] leading-relaxed"
                      placeholder={copy.replyPlaceholder}
                      value={resposta}
                      onChange={(e) => setResposta(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          enviarResposta();
                        }
                      }}
                    />
                    <motion.button
                      whileHover={{ scale: 1.06, y: -1 }}
                      whileTap={{ scale: 0.94 }}
                      onClick={enviarResposta}
                      disabled={!resposta.trim() || enviando}
                      className="w-10 h-10 rounded-[10px] flex items-center justify-center text-white disabled:opacity-35 flex-shrink-0 shadow-[0_4px_14px_rgba(227,19,27,.3)] disabled:shadow-none transition-shadow"
                      style={{ background: "var(--gradient-signature)" }}
                    >
                      {enviando ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : (
                        <Send size={15} strokeWidth={2} />
                      )}
                    </motion.button>
                  </div>

                  {/* Char counter */}
                  <div className="flex justify-end">
                    <span
                      className={`text-[10px] tabular-nums transition-colors ${
                        charPct >= 0.9 ? "text-[#E3131B] font-semibold" : "text-muted-foreground"
                      }`}
                    >
                      {resposta.length} / {limit}
                    </span>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
