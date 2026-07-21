"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HelpCircle, Send, CheckCircle2 } from "lucide-react";

type Plataforma = "mercadolivre" | "shopee" | "tiktok";
type Status = "pendente" | "respondida";

type Pergunta = {
  id: string;
  plataforma: Plataforma;
  produto: string;
  pergunta: string;
  cliente: string;
  tempo: string;
  status: Status;
  resposta?: string;
};

const PLATAFORMAS: Record<Plataforma, { label: string; color: string; bg: string }> = {
  mercadolivre: { label: "Mercado Livre", color: "#333", bg: "#FFE600" },
  shopee:       { label: "Shopee",        color: "#fff", bg: "#EE4D2D" },
  tiktok:       { label: "TikTok Shop",   color: "#fff", bg: "#010101" },
};

const DADOS_SIMULADOS: Pergunta[] = [
  { id: "1", plataforma: "mercadolivre", produto: "Bolsa KARZI Couro Marrom", pergunta: "Tem disponível no tamanho P?", cliente: "Comprador 4821", tempo: "2h", status: "pendente" },
  { id: "2", plataforma: "shopee",       produto: "Mochila WUWU Sport",       pergunta: "Qual o prazo de entrega para SP?", cliente: "Comprador 1203", tempo: "5h", status: "pendente" },
  { id: "3", plataforma: "tiktok",       produto: "Carteira KARZI Slim",      pergunta: "Esse produto tem garantia?", cliente: "Comprador 7734", tempo: "8h", status: "pendente" },
  { id: "4", plataforma: "mercadolivre", produto: "Bolsa KARZI Couro Marrom", pergunta: "Aceita parcelamento em 12x?", cliente: "Comprador 9912", tempo: "1d", status: "respondida", resposta: "Sim, parcelamos em até 12x sem juros pelo Mercado Pago!" },
  { id: "5", plataforma: "shopee",       produto: "Mochila WUWU Sport",       pergunta: "Tem foto do interior da mochila?", cliente: "Comprador 2281", tempo: "2d", status: "respondida", resposta: "Olá! Vou adicionar mais fotos ainda hoje. Obrigado pelo interesse!" },
];

const FILTROS_STATUS = [
  { value: "todos" as const,       label: "Todos" },
  { value: "pendente" as const,    label: "Pendente" },
  { value: "respondida" as const,  label: "Respondida" },
];

function PlataformaBadge({ p }: { p: Plataforma }) {
  const { label, color, bg } = PLATAFORMAS[p];
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: bg, color }}>
      {label}
    </span>
  );
}

export function InboxPerguntas() {
  const [filtroPlat, setFiltroPlat] = useState<Plataforma | "todos">("todos");
  const [filtroStatus, setFiltroStatus] = useState<Status | "todos">("todos");
  const [selecionada, setSelecionada] = useState<Pergunta | null>(null);
  const [resposta, setResposta] = useState("");
  const [perguntas, setPerguntas] = useState<Pergunta[]>(DADOS_SIMULADOS);

  const filtradas = perguntas.filter((p) => {
    if (filtroPlat !== "todos" && p.plataforma !== filtroPlat) return false;
    if (filtroStatus !== "todos" && p.status !== filtroStatus) return false;
    return true;
  });

  const pendentes = perguntas.filter((p) => p.status === "pendente").length;

  function enviarResposta() {
    if (!selecionada || !resposta.trim()) return;
    const texto = resposta.trim();
    setPerguntas((prev) =>
      prev.map((p) => p.id === selecionada.id ? { ...p, status: "respondida", resposta: texto } : p)
    );
    setSelecionada((prev) => prev ? { ...prev, status: "respondida", resposta: texto } : null);
    setResposta("");
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0, 0, 0.2, 1] }}
      className="flex gap-4 h-[calc(100vh-13rem)]"
    >
      {/* ── Painel esquerdo ── */}
      <div className="w-80 flex-shrink-0 rounded-[1.25rem] bg-card shadow-[0_2px_16px_rgba(14,15,19,.07)] overflow-hidden flex flex-col">

        {/* Header com contador */}
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Perguntas</p>
            {pendentes > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#E3131B]/10 text-[#E3131B]">
                {pendentes} pendente{pendentes > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        {/* Filtro plataforma */}
        <div className="px-3 py-2.5 border-b border-border flex gap-1.5 flex-wrap">
          {(["todos", "mercadolivre", "shopee", "tiktok"] as const).map((p) => (
            <motion.button
              key={p}
              onClick={() => setFiltroPlat(p)}
              whileTap={{ scale: 0.96 }}
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors ${
                filtroPlat === p
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {p === "todos" ? "Todos" : PLATAFORMAS[p].label}
            </motion.button>
          ))}
        </div>

        {/* Filtro status */}
        <div className="px-3 py-2 border-b border-border flex gap-1.5">
          {FILTROS_STATUS.map((f) => (
            <motion.button
              key={f.value}
              onClick={() => setFiltroStatus(f.value)}
              whileTap={{ scale: 0.96 }}
              className={`text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors ${
                filtroStatus === f.value
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </motion.button>
          ))}
        </div>

        {/* Lista */}
        <div className="overflow-y-auto flex-1">
          <AnimatePresence>
            {filtradas.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-12 text-center px-4"
              >
                <HelpCircle size={24} strokeWidth={1.5} className="text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">Nenhuma pergunta encontrada</p>
              </motion.div>
            ) : filtradas.map((p, i) => (
              <motion.button
                key={p.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03, duration: 0.2, ease: [0, 0, 0.2, 1] }}
                onClick={() => setSelecionada(p)}
                whileHover={{ backgroundColor: "rgba(0,0,0,0.025)" }}
                className={`w-full text-left px-4 py-3.5 border-b border-border last:border-0 relative ${
                  selecionada?.id === p.id ? "bg-muted" : ""
                }`}
              >
                {selecionada?.id === p.id && (
                  <motion.span
                    layoutId="pergunta-active"
                    className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full"
                    style={{ background: "var(--gradient-signature)" }}
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <PlataformaBadge p={p.plataforma} />
                  <span className="text-[10px] text-muted-foreground">{p.tempo}</span>
                </div>
                <p className="text-xs font-medium text-foreground truncate mb-0.5">{p.produto}</p>
                <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{p.pergunta}</p>
                <div className="mt-2">
                  {p.status === "pendente" ? (
                    <span className="text-[10px] font-semibold text-[#B57A00] bg-[#B57A00]/10 px-2 py-0.5 rounded-full">Pendente</span>
                  ) : (
                    <span className="text-[10px] font-semibold text-[#1F8A4C] bg-[#1F8A4C]/10 px-2 py-0.5 rounded-full flex items-center gap-1 w-fit">
                      <CheckCircle2 size={10} strokeWidth={2.5} /> Respondida
                    </span>
                  )}
                </div>
              </motion.button>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Painel direito ── */}
      <div className="flex-1 rounded-[1.25rem] bg-card shadow-[0_2px_16px_rgba(14,15,19,.07)] overflow-hidden flex flex-col">
        <AnimatePresence mode="wait">
          {!selecionada ? (
            <motion.div
              key="vazio"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex-1 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground"
            >
              <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center">
                <HelpCircle size={20} strokeWidth={1.5} />
              </div>
              <span className="mt-1">Selecione uma pergunta</span>
            </motion.div>
          ) : (
            <motion.div
              key={selecionada.id}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col flex-1 overflow-hidden"
            >
              {/* Header */}
              <div className="px-5 py-4 border-b border-border">
                <div className="flex items-center gap-2 mb-1">
                  <PlataformaBadge p={selecionada.plataforma} />
                  <span className="text-xs text-muted-foreground">{selecionada.tempo}</span>
                </div>
                <p className="text-sm font-semibold text-foreground">{selecionada.produto}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{selecionada.cliente}</p>
              </div>

              {/* Conteúdo */}
              <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
                {/* Pergunta do cliente */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Pergunta do cliente</span>
                  <div className="bg-muted rounded-[0.75rem] px-4 py-3 text-sm text-foreground max-w-[80%]">
                    {selecionada.pergunta}
                  </div>
                </div>

                {/* Resposta (se houver) */}
                {selecionada.resposta && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col gap-1 items-end"
                  >
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Sua resposta</span>
                    <div
                      className="rounded-[0.75rem] px-4 py-3 text-sm text-white max-w-[80%] shadow-[0_2px_12px_rgba(227,19,27,.2)]"
                      style={{ background: "var(--gradient-signature)" }}
                    >
                      {selecionada.resposta}
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Input de resposta */}
              {selecionada.status === "pendente" && (
                <div className="px-5 py-4 border-t border-border">
                  <div className="flex gap-2 items-end">
                    <textarea
                      className="flex-1 resize-none rounded-[0.75rem] bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[72px] max-h-[120px]"
                      placeholder="Escreva sua resposta…"
                      value={resposta}
                      onChange={(e) => setResposta(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) enviarResposta(); }}
                    />
                    <motion.button
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.96 }}
                      onClick={enviarResposta}
                      disabled={!resposta.trim()}
                      className="h-10 w-10 rounded-[0.75rem] flex items-center justify-center text-white disabled:opacity-40 shrink-0"
                      style={{ background: "var(--gradient-signature)" }}
                    >
                      <Send size={15} strokeWidth={2} />
                    </motion.button>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1.5">⌘ + Enter para enviar</p>
                </div>
              )}

              {selecionada.status === "respondida" && (
                <div className="px-5 py-3 border-t border-border">
                  <p className="text-xs text-[#1F8A4C] flex items-center gap-1.5">
                    <CheckCircle2 size={13} strokeWidth={2} /> Pergunta respondida
                  </p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
