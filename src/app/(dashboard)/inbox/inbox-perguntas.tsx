"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HelpCircle, Send, CheckCircle2, Loader2 } from "lucide-react";
type Plataforma = "mercadolivre" | "shopee" | "tiktok";
type Status = "pendente" | "respondida";

type Pergunta = {
  id: string;
  plataforma: Plataforma;
  produto: string;
  pergunta: string;
  cliente: string;
  tempo: string;
  horasAtras: number;
  status: Status;
  resposta?: string;
};

const PLAT: Record<Plataforma, {
  label: string;
  shortLabel: string;
  stripe: string;
  logo: string;
  logoDark?: boolean;
}> = {
  mercadolivre: {
    label: "Mercado Livre",
    shortLabel: "ML",
    stripe: "#FFB900",
    logo: "/logos/mercadolivre.svg",
  },
  shopee: {
    label: "Shopee",
    shortLabel: "Shopee",
    stripe: "#EE4D2D",
    logo: "/logos/shopee.svg",
  },
  tiktok: {
    label: "TikTok Shop",
    shortLabel: "TikTok",
    stripe: "#00C2CB",
    logo: "/logos/tiktok.svg",
    logoDark: true,
  },
};

const QUICK_REPLIES: Record<Plataforma, string[]> = {
  mercadolivre: [
    "Sim, temos disponível! ✅",
    "Enviamos para todo o Brasil via Correios.",
    "Parcelamos em até 12× sem juros.",
  ],
  shopee: [
    "Olá! Estamos verificando e já te retorno. 😊",
    "Prazo de envio: 1–2 dias úteis após confirmação.",
    "Produto com garantia de 90 dias de fábrica.",
  ],
  tiktok: [
    "Oi! Pode conferir as fotos no anúncio. 👀",
    "Entregamos com rastreio em todo o Brasil.",
    "Tem dúvida? Chama a gente por aqui mesmo!",
  ],
};

const CHAR_LIMIT: Record<Plataforma, number> = {
  mercadolivre: 2000,
  shopee: 1000,
  tiktok: 500,
};

const DADOS_SIMULADOS: Pergunta[] = [
  { id: "1", plataforma: "mercadolivre", produto: "Bolsa KARZI Couro Marrom", pergunta: "Tem disponível no tamanho P?",       cliente: "Comprador 4821", tempo: "2h",  horasAtras: 2,  status: "pendente" },
  { id: "2", plataforma: "shopee",       produto: "Mochila WUWU Sport",       pergunta: "Qual o prazo de entrega para SP?",  cliente: "Comprador 1203", tempo: "5h",  horasAtras: 5,  status: "pendente" },
  { id: "3", plataforma: "tiktok",       produto: "Carteira KARZI Slim",      pergunta: "Esse produto tem garantia?",        cliente: "Comprador 7734", tempo: "8h",  horasAtras: 8,  status: "pendente" },
  { id: "4", plataforma: "mercadolivre", produto: "Bolsa KARZI Couro Marrom", pergunta: "Aceita parcelamento em 12x?",       cliente: "Comprador 9912", tempo: "1d",  horasAtras: 26, status: "respondida", resposta: "Sim, parcelamos em até 12× sem juros pelo Mercado Pago!" },
  { id: "5", plataforma: "shopee",       produto: "Mochila WUWU Sport",       pergunta: "Tem foto do interior da mochila?", cliente: "Comprador 2281", tempo: "2d",  horasAtras: 50, status: "respondida", resposta: "Olá! Vou adicionar mais fotos ainda hoje. Obrigado pelo interesse!" },
];

function urgency(h: number, status: Status): "urgent" | "normal" | "ok" {
  if (status === "respondida") return "ok";
  if (h >= 24) return "urgent";
  if (h >= 6)  return "urgent";
  return "normal";
}

const URGENCY_COLOR = {
  urgent: "#E3131B",
  normal: "#9B30D9",
  ok:     "#1F8A4C",
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.035 } },
};
const cardVariant = {
  hidden: { opacity: 0, x: -8 },
  show: { opacity: 1, x: 0, transition: { duration: 0.22, ease: [0, 0, 0.2, 1] as [number,number,number,number] } },
};

/* ── Platform Logo ─────────────────────────────────────── */
function PlatLogo({ p, h = 14 }: { p: Plataforma; h?: number }) {
  const cfg = PLAT[p];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={cfg.logo}
      alt={cfg.label}
      style={{ height: h, width: "auto", maxWidth: h * 3.5, display: "block", objectFit: "contain" }}
      className={cfg.logoDark ? "dark:invert" : ""}
    />
  );
}

/* ── Platform Tab ──────────────────────────────────────── */
function PlatTab({
  plat, active, pendingCount, onClick,
}: {
  plat: Plataforma | "todos";
  active: boolean;
  pendingCount: number;
  onClick: () => void;
}) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      className={`relative flex-1 flex flex-col items-center gap-1.5 px-1 pb-2.5 pt-2 rounded-t-lg text-[10px] font-semibold transition-colors ${
        active
          ? "bg-card text-foreground border border-b-0 border-border"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
      }`}
      style={active ? { marginBottom: -1 } : undefined}
    >
      {plat === "todos" ? (
        <span className="text-base leading-none opacity-70">◎</span>
      ) : (
        <span className="flex items-center justify-center h-[18px]">
          <PlatLogo p={plat} h={14} />
        </span>
      )}
      <span className="leading-none">
        {plat === "todos" ? "Todos" : PLAT[plat].shortLabel}
      </span>
      <AnimatePresence>
        {pendingCount > 0 && (
          <motion.span
            key="badge"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            className="absolute top-1 right-2 min-w-[15px] h-[15px] flex items-center justify-center bg-[#E3131B] text-white text-[8px] font-bold rounded-full px-1 leading-none"
          >
            {pendingCount}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

/* ── Main ──────────────────────────────────────────────── */
export function InboxPerguntas() {
  const [filtroPlat, setFiltroPlat]     = useState<Plataforma | "todos">("todos");
  const [filtroStatus, setFiltroStatus] = useState<Status | "todos">("todos");
  const [selecionada, setSelecionada]   = useState<Pergunta | null>(null);
  const [resposta, setResposta]         = useState("");
  const [enviando, setEnviando]         = useState(false);
  const [perguntas, setPerguntas]       = useState<Pergunta[]>(DADOS_SIMULADOS);

  const filtradas = perguntas.filter((p) => {
    if (filtroPlat !== "todos" && p.plataforma !== filtroPlat) return false;
    if (filtroStatus !== "todos" && p.status !== filtroStatus) return false;
    return true;
  });

  const pendentesTotais  = perguntas.filter((p) => p.status === "pendente").length;
  const pendentesPorPlat = (pl: Plataforma) =>
    perguntas.filter((p) => p.plataforma === pl && p.status === "pendente").length;

  const limit  = selecionada ? CHAR_LIMIT[selecionada.plataforma] : 2000;
  const charPct = resposta.length / limit;

  function enviarResposta() {
    if (!selecionada || !resposta.trim() || enviando) return;
    const texto = resposta.trim();
    setEnviando(true);
    setTimeout(() => {
      setPerguntas((prev) =>
        prev.map((p) => p.id === selecionada.id ? { ...p, status: "respondida", resposta: texto } : p)
      );
      setSelecionada((prev) => prev ? { ...prev, status: "respondida", resposta: texto } : null);
      setResposta("");
      setEnviando(false);
    }, 400);
  }

  function usarChip(texto: string) {
    setResposta(texto);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0, 0, 0.2, 1] }}
      className="flex gap-4 h-[calc(100vh-13rem)]"
    >
      {/* ── Sidebar ── */}
      <div className="w-[304px] flex-shrink-0 rounded-[1.25rem] bg-card shadow-[0_2px_16px_rgba(14,15,19,.07)] overflow-hidden flex flex-col">

        {/* Platform tabs */}
        <div className="flex gap-0.5 px-2 pt-1 border-b border-border bg-muted/30">
          {(["todos", "mercadolivre", "shopee", "tiktok"] as const).map((p) => (
            <PlatTab
              key={p}
              plat={p}
              active={filtroPlat === p}
              pendingCount={p === "todos" ? pendentesTotais : pendentesPorPlat(p)}
              onClick={() => setFiltroPlat(p)}
            />
          ))}
        </div>

        {/* Status filter row */}
        <div className="flex gap-1 px-3 py-2 border-b border-border bg-muted/20">
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
              {s === "todos" ? "Todos" : s === "pendente" ? "Pendentes" : "Respondidas"}
            </motion.button>
          ))}
        </div>

        {/* Card list */}
        <div className="overflow-y-auto flex-1 scrollbar-thin">
          <AnimatePresence initial={false}>
            {filtradas.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-12 text-center px-4"
              >
                <HelpCircle size={24} strokeWidth={1.5} className="text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">Nenhuma pergunta encontrada</p>
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
                      onClick={() => { setSelecionada(p); setResposta(""); }}
                      className={`w-full text-left border-b border-border last:border-0 relative flex items-stretch transition-colors ${
                        isActive ? "bg-muted/60" : "hover:bg-muted/30"
                      } ${isAnswered ? "opacity-55" : ""}`}
                    >
                      {/* Gradient active pip */}
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
                      <span className="flex-1 min-w-0 px-3 py-3">
                        <span className="block text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground truncate mb-1">
                          {p.produto}
                        </span>
                        <span className="block text-[13px] text-foreground leading-snug line-clamp-2 mb-1.5">
                          {p.pergunta}
                        </span>
                        <span className="flex items-center gap-1.5">
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
                    </motion.button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 rounded-[1.25rem] bg-card shadow-[0_2px_16px_rgba(14,15,19,.07)] overflow-hidden flex flex-col">
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
                Selecione uma pergunta
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
                {/* Platform logo pill */}
                <motion.span
                  initial={{ scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 24 }}
                  className="flex items-center justify-center h-7 px-2.5 rounded-full bg-white border border-black/8 shadow-[0_1px_4px_rgba(0,0,0,.06)] flex-shrink-0"
                >
                  <PlatLogo p={selecionada.plataforma} h={14} />
                </motion.span>

                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-bold text-foreground truncate leading-tight">
                    {selecionada.produto}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{selecionada.cliente}</p>
                </div>

                <span className="text-[11px] text-muted-foreground tabular-nums flex-shrink-0">
                  {selecionada.tempo} atrás
                </span>
              </div>

              {/* Stage area */}
              <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5 scrollbar-thin">
                {/* Question bubble */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.06, duration: 0.22, ease: [0, 0, 0.2, 1] }}
                >
                  <p className="text-[10px] font-bold uppercase tracking-[.08em] text-muted-foreground mb-2">
                    Pergunta
                  </p>
                  <div
                    className="rounded-[4px_14px_14px_14px] border border-border bg-muted/40 px-4 py-3.5 text-[15px] text-foreground leading-relaxed max-w-[78%]"
                  >
                    {selecionada.pergunta}
                  </div>
                </motion.div>

                {/* Answer bubble */}
                {selecionada.resposta && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1, duration: 0.22, ease: [0, 0, 0.2, 1] }}
                    className="flex flex-col items-end gap-2"
                  >
                    <p className="text-[10px] font-bold uppercase tracking-[.08em] text-muted-foreground">
                      Sua resposta
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
                  <p className="text-xs text-[#1F8A4C] font-medium">Pergunta respondida</p>
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
                  {/* Quick reply chips */}
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[.07em] text-muted-foreground mb-2">
                      Resposta rápida
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {QUICK_REPLIES[selecionada.plataforma].map((chip) => (
                        <motion.button
                          key={chip}
                          onClick={() => usarChip(chip)}
                          whileHover={{ scale: 1.02, borderColor: "#9B30D9" }}
                          whileTap={{ scale: 0.97 }}
                          className="text-[12px] font-medium px-3 py-1.5 rounded-full border border-border text-muted-foreground bg-muted/40 hover:text-foreground hover:bg-[rgba(155,48,217,.06)] transition-colors text-left leading-snug"
                        >
                          {chip}
                        </motion.button>
                      ))}
                    </div>
                  </div>

                  {/* Textarea row */}
                  <div className="flex items-end gap-2">
                    <textarea
                      className="flex-1 resize-none rounded-[10px] border border-border bg-muted/30 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[rgba(155,48,217,.5)] focus:shadow-[0_0_0_3px_rgba(155,48,217,.08)] transition-[border-color,box-shadow] min-h-[62px] max-h-[120px] leading-relaxed"
                      placeholder="Escreva sua resposta…"
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
