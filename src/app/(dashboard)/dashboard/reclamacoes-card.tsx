"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ChevronDown, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { listItem, springs, stagger } from "@/shared/design-system/motion-variants";
import { getIcon } from "@/shared/config/icon-registry";
import dashboardConfig from "@/config/dashboard.json";
import { Card, CardHead } from "./card-primitives";
import { actionListarMensagensReclamacao, actionResponderReclamacao } from "./actions";
import type { ReclamacaoMensagem } from "@/modules/relatorios/application/reclamacoes.service";
import type { ReclamacoesResultado } from "@/modules/relatorios/application/reclamacoes.service";

const copy = dashboardConfig.cards.reclamacoes;

function tempoAberta(dias: number | null): string {
  if (dias === null) return "—";
  if (dias === 0) return copy.todayLabel;
  return `${dias} ${dias === 1 ? copy.dayLabel : copy.daysLabel}`;
}

function Esqueleto() {
  return (
    <ul className="mt-4">
      {[0, 1, 2].map((linha) => (
        <li key={linha} className="border-b border-border px-5 py-3.5 last:border-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="shimmer h-3.5 w-24 rounded-full" />
              <div className="shimmer mt-2 h-2.5 w-32 rounded-full" />
            </div>
            <div className="shimmer h-3.5 w-10 rounded-full" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ── Balão de mensagem ────────────────────────────────────────
   Mensagens do vendedor (nós) alinhadas à direita, do outro lado à
   esquerda — leitura de conversa, não de log. */
function Balao({ mensagem }: { mensagem: ReclamacaoMensagem }) {
  return (
    <div className={`flex ${mensagem.deVendedor ? "justify-end" : "justify-start"}`}>
      <div
        className="max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed text-foreground"
        style={{ background: mensagem.deVendedor ? `${copy.accent}14` : "var(--muted)" }}
      >
        <p className="whitespace-pre-line">{mensagem.texto}</p>
        {mensagem.criadaEm && (
          <p className="mt-1 text-[10px] tabular-nums text-muted-foreground">
            {new Date(mensagem.criadaEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
      </div>
    </div>
  );
}

/* ── Linha de reclamação ───────────────────────────────────────
   Fechada mostra o veredito (estágio + prazo). Aberta carrega a
   conversa ao vivo do Mercado Livre e permite responder — sem
   persistência local, a reclamação não tem conversa/mensagem no CRM. */
function LinhaReclamacao({ item, aberta, onAlternar }: {
  item: ReclamacoesResultado["itens"][number];
  aberta: boolean;
  onAlternar: () => void;
}) {
  const reduzido = useReducedMotion();
  const [mensagens, setMensagens] = useState<ReclamacaoMensagem[] | null>(null);
  const [carregandoThread, setCarregandoThread] = useState(false);
  const [erroThread, setErroThread] = useState(false);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);

  const carregarThread = useCallback(async () => {
    setCarregandoThread(true);
    setErroThread(false);
    try {
      setMensagens(await actionListarMensagensReclamacao(item.marca, item.id));
    } catch {
      setErroThread(true);
    } finally {
      setCarregandoThread(false);
    }
  }, [item.marca, item.id]);

  const abrir = useCallback(() => {
    onAlternar();
    if (!aberta && mensagens === null && !carregandoThread) void carregarThread();
  }, [onAlternar, aberta, mensagens, carregandoThread, carregarThread]);

  const enviar = useCallback(async () => {
    const conteudo = texto.trim();
    if (!conteudo || enviando) return;
    setEnviando(true);
    try {
      await actionResponderReclamacao(item.marca, item.id, conteudo, item.emMediacao);
      toast.success(copy.sendSuccess);
      setTexto("");
      await carregarThread();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : copy.sendError);
    } finally {
      setEnviando(false);
    }
  }, [texto, enviando, item.marca, item.id, item.emMediacao, carregarThread]);

  return (
    <div className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={abrir}
        aria-expanded={aberta}
        className="press-feedback flex w-full items-start justify-between gap-3 px-5 py-3 text-left transition-colors hover:bg-muted/40"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-semibold text-foreground">{item.estagio}</span>
            {item.emMediacao && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                style={{ background: `${copy.accent}1A`, color: copy.accent }}
              >
                escalou
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {item.marcaLabel}{item.motivo ? ` · ${item.motivo}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-start gap-2">
          <div className="text-right">
            <p className="text-sm font-bold tabular-nums text-foreground">
              {tempoAberta(item.diasAberta)}
            </p>
            {item.pedidoHref && (
              <Link
                href={item.pedidoHref}
                onClick={(event) => event.stopPropagation()}
                className="press-feedback mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
              >
                {copy.orderLabel} <ArrowRight size={11} />
              </Link>
            )}
          </div>
          <motion.span
            animate={{ rotate: aberta ? 180 : 0 }}
            transition={reduzido ? { duration: 0 } : springs.settleFast}
            className="mt-0.5 text-muted-foreground"
          >
            <ChevronDown size={16} />
          </motion.span>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {aberta && (
          <motion.div
            key="thread"
            initial={reduzido ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduzido ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={reduzido ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={reduzido ? { duration: 0.15 } : springs.settle}
            className="overflow-hidden"
          >
            <div className="bg-muted/25 px-5 pb-4 pt-1">
              <p className="mb-2 text-[11px] font-semibold text-muted-foreground">
                {item.emMediacao ? copy.toMediator : copy.toComplainant}
              </p>

              {carregandoThread && (
                <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 size={15} className="animate-spin" /> {copy.loadingThread}
                </div>
              )}

              {!carregandoThread && erroThread && (
                <p className="py-4 text-sm text-[#C21820]">{copy.threadError}</p>
              )}

              {!carregandoThread && !erroThread && mensagens && (
                <div className="flex flex-col gap-2 py-2">
                  {mensagens.length === 0 ? (
                    <p className="py-2 text-sm text-muted-foreground">{copy.emptyThread}</p>
                  ) : (
                    mensagens.map((mensagem, indice) => <Balao key={indice} mensagem={mensagem} />)
                  )}
                </div>
              )}

              <div className="mt-3 flex items-end gap-2">
                <textarea
                  value={texto}
                  onChange={(event) => setTexto(event.target.value)}
                  placeholder={copy.placeholder}
                  rows={2}
                  maxLength={2000}
                  disabled={enviando}
                  className="min-h-[2.5rem] flex-1 resize-none rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-foreground disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => void enviar()}
                  disabled={enviando || !texto.trim()}
                  className="press-feedback flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white transition-opacity disabled:opacity-40"
                  style={{ background: copy.accent }}
                  aria-label={copy.send}
                >
                  {enviando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ReclamacoesCard({ dados, carregando, scope }: {
  dados: ReclamacoesResultado | null;
  carregando: boolean;
  scope?: React.ReactNode;
}) {
  const Icon = getIcon(copy.icon);
  const total = dados?.total ?? 0;
  const [aberta, setAberta] = useState<string | null>(null);

  return (
    <Card>
      <CardHead
        title={copy.title}
        subtitle={copy.subtitle}
        icon={Icon}
        accent={copy.accent}
        trailing={total > 0 ? (
          <span
            className="rounded-full px-2 py-0.5 text-xs font-bold tabular-nums"
            style={{ background: `${copy.accent}1A`, color: copy.accent }}
          >
            {total}
          </span>
        ) : undefined}
      />

      {scope}

      {carregando && <Esqueleto />}

      {!carregando && dados?.semContaConectada && (
        <EmptyState
          illustration="complaints"
          title={copy.disconnectedTitle}
          description={copy.disconnectedDescription}
        />
      )}

      {!carregando && dados && !dados.semContaConectada && dados.itens.length === 0 && (
        <EmptyState
          illustration="complaints"
          title={copy.emptyTitle}
          description={copy.emptyDescription}
        />
      )}

      {!carregando && dados && dados.itens.length > 0 && (
        <>
          {dados.marcasComFalha.length > 0 && (
            <p className="mx-5 mt-3 rounded-lg bg-[#B57A00]/10 px-3 py-2 text-[11px] font-medium text-[#B57A00]">
              {copy.partialLabel}: {dados.marcasComFalha.join(", ")}
            </p>
          )}
          <motion.div variants={stagger} initial="hidden" animate="show" className="mt-4">
            {dados.itens.map((item) => (
              <motion.div key={item.id} variants={listItem}>
                <LinhaReclamacao
                  item={item}
                  aberta={aberta === item.id}
                  onAlternar={() => setAberta((atual) => (atual === item.id ? null : item.id))}
                />
              </motion.div>
            ))}
          </motion.div>
        </>
      )}
    </Card>
  );
}
