"use client";

import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ChevronDown, Info, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { listItem, springs, stagger } from "@/shared/design-system/motion-variants";
import { AnimatedInfoPopover } from "@/shared/design-system/primitives/AnimatedInfoPopover";
import dashboardConfig from "@/config/dashboard.json";
import { Card, CardHead, useContagem } from "../metricas-primitives";
import { getBrandConfig, isBrandSlug } from "@/shared/config/brands";
import { actionListarMensagensReclamacao, actionResponderReclamacao } from "./actions";
import type { ReclamacaoMensagem } from "@/modules/metricas/application/reclamacoes.service";
import type { ReclamacoesResultado } from "@/modules/metricas/application/reclamacoes.service";
import { tint } from "@/shared/design-system/color";

const copy = dashboardConfig.cards.reclamacoes;

function tempoAberta(dias: number | null): string {
  if (dias === null) return "Sem dado";
  if (dias === 0) return copy.todayLabel;
  return `${dias} ${dias === 1 ? copy.dayLabel : copy.daysLabel}`;
}

function diasDesde(dataIso: string | null): number | null {
  if (!dataIso) return null;
  const data = new Date(dataIso);
  if (Number.isNaN(data.getTime())) return null;
  return Math.floor((Date.now() - data.getTime()) / 86_400_000);
}

function tempoAtualizacao(dias: number | null): string {
  if (dias === null || dias === 0) return copy.resolvedUpdatedToday;
  return `${copy.resolvedUpdatedSince} ${dias} ${dias === 1 ? copy.dayLabel : copy.daysLabel}`;
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

/* ── Formatação de mensagem ────────────────────────────────────
   O assistente do Mercado Livre manda texto misturando HTML solto
   (<strong>, <br>, <a href>, <ul>/<li>, <span class="message-badge">) com
   **negrito** em markdown — sem tratar, aparece tudo como código cru na
   tela. Vira negrito e link de verdade, <br> e <li> viram quebra de linha
   e marcador, e a badge vira uma pilulazinha. Qualquer tag que sobrar
   (uma que o ML mande e ainda não conhecemos) é removida no fim — nunca
   aparece código cru, mesmo pra tag nova. */
function normalizarListas(texto: string): string {
  return texto
    .replace(/<li>([\s\S]*?)<\/li>/g, "\n• $1")
    .replace(/<\/?(ul|ol)>/g, "");
}

const TOKEN_FORMATACAO = /(<strong>[\s\S]*?<\/strong>|\*\*[\s\S]*?\*\*|<span class="message-badge">[\s\S]*?<\/span>|<a href="[^"]*">[\s\S]*?<\/a>|<br\s*\/?>)/g;

function formatarMensagem(texto: string): React.ReactNode {
  return normalizarListas(texto).split(TOKEN_FORMATACAO).map((trecho, indice) => {
    if (/^<br\s*\/?>$/.test(trecho)) {
      return <br key={indice} />;
    }

    const badge = trecho.match(/^<span class="message-badge">([\s\S]*?)<\/span>$/);
    if (badge) {
      return (
        <span key={indice} className="mx-1 inline-block rounded-full bg-amber-400/20 px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide text-amber-600">
          {badge[1]}
        </span>
      );
    }

    const link = trecho.match(/^<a href="([^"]*)">([\s\S]*?)<\/a>$/);
    if (link) {
      const [, href, rotulo] = link;
      const rotuloLimpo = rotulo.replace(/<[^>]+>/g, "");
      // As mensagens não são só do assistente do ML — o comprador também
      // escreve nessa thread. Um href "javascript:" ou "data:" forjado por
      // ele viraria clique-para-executar dentro do painel; só http(s) passa.
      if (!/^https?:\/\//i.test(href)) return rotuloLimpo;
      return (
        <a
          key={indice}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-dotted underline-offset-2 hover:text-foreground"
          style={{ color: copy.accent }}
        >
          {rotuloLimpo}
        </a>
      );
    }

    const negritoHtml = trecho.match(/^<strong>([\s\S]*?)<\/strong>$/);
    const negritoMarkdown = trecho.match(/^\*\*([\s\S]*?)\*\*$/);
    const conteudoNegrito = negritoHtml?.[1] ?? negritoMarkdown?.[1];
    if (conteudoNegrito !== undefined) {
      return <strong key={indice} className="font-semibold">{conteudoNegrito.replace(/<[^>]+>/g, "")}</strong>;
    }

    // Rede de segurança: qualquer marcação que sobrar (tag desconhecida,
    // não coberta acima) é removida — só o texto fica, nunca a tag crua.
    return trecho.replace(/<[^>]+>/g, "");
  });
}

/* ── Balão de mensagem ────────────────────────────────────────
   Mensagens do vendedor (nós) alinhadas à direita, do outro lado à
   esquerda — leitura de conversa, não de log. */
function Balao({ mensagem }: { mensagem: ReclamacaoMensagem }) {
  return (
    <div className={`flex ${mensagem.deVendedor ? "justify-end" : "justify-start"}`}>
      <div
        className="max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed text-foreground"
        style={{ background: mensagem.deVendedor ? tint(copy.accent, 8) : "var(--muted)" }}
      >
        <p className="whitespace-pre-line">{formatarMensagem(mensagem.texto)}</p>
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

  const resolvida = !item.precisaAcao;

  return (
    <div className={`border-b border-border last:border-0 ${resolvida ? "opacity-70" : ""}`}>
      <button
        type="button"
        onClick={abrir}
        aria-expanded={aberta}
        className="press-feedback flex w-full items-start justify-between gap-3 px-5 py-3 text-left transition-colors hover:bg-muted/40"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`text-sm font-semibold ${resolvida ? "text-muted-foreground line-through decoration-1" : "text-foreground"}`}>
              {item.estagio}
            </span>
            {resolvida && (
              <AnimatedInfoPopover
                trigger={(
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(event) => event.stopPropagation()}
                    className="press-feedback cursor-pointer rounded-full bg-success/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-success transition-opacity hover:opacity-80"
                  >
                    {copy.resolvedLabel}
                  </span>
                )}
                align="start"
                sideOffset={6}
                collisionPadding={12}
                className="z-[100] w-64 rounded-xl border border-border bg-card p-3 shadow-[0_16px_40px_rgba(14,15,19,.24)]"
              >
                <p className="text-[12px] leading-relaxed text-foreground/85">{copy.resolvedHint}</p>
              </AnimatedInfoPopover>
            )}
            {item.emMediacao && (
              // Trigger não pode ser <button>: esta linha inteira já é um
              // <button> (abre/fecha a thread) — <button> dentro de <button>
              // é HTML inválido. `stopPropagation` evita que o clique também
              // dispare o onClick da linha por baixo.
              <AnimatedInfoPopover
                trigger={(
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(event) => event.stopPropagation()}
                    className="press-feedback cursor-pointer rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide transition-opacity hover:opacity-80"
                    style={{ background: tint(copy.accent, 10), color: copy.accent }}
                  >
                    escalou
                  </span>
                )}
                align="start"
                sideOffset={6}
                collisionPadding={12}
                className="z-[100] w-64 rounded-xl border border-border bg-card p-3 shadow-[0_16px_40px_rgba(14,15,19,.24)]"
              >
                <p className="text-[12px] leading-relaxed text-foreground/85">
                  Escalada para a mediação oficial do Mercado Livre — o comprador não aceitou a resposta e pediu que o ML decida.
                </p>
              </AnimatedInfoPopover>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            <span
              className="font-semibold"
              style={isBrandSlug(item.marca) ? { color: getBrandConfig(item.marca)?.color } : undefined}
            >
              {item.marcaLabel}
            </span>
            {item.motivo && (
              <span className="inline-flex items-center gap-0.5">
                {" · "}<span className="text-muted-foreground/70">Motivo:</span> {item.motivo}
                <AnimatedInfoPopover
                  trigger={(
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(event) => event.stopPropagation()}
                      className="press-feedback ml-0.5 inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:text-primary"
                    >
                      <Info aria-hidden="true" size={10} />
                    </span>
                  )}
                  align="start"
                  sideOffset={6}
                  collisionPadding={12}
                  className="z-[100] w-64 rounded-xl border border-border bg-card p-3 shadow-[0_16px_40px_rgba(14,15,19,.24)]"
                >
                  <p className="text-[12px] leading-relaxed text-foreground/85">
                    Código do motivo da reclamação — o Mercado Livre não devolve um texto legível para ele.
                  </p>
                </AnimatedInfoPopover>
              </span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-start gap-2">
          <div className="text-right">
            <p className={resolvida
              ? "max-w-[7rem] text-[11px] font-semibold leading-snug text-muted-foreground"
              : "text-sm font-bold tabular-nums text-foreground"}
            >
              {resolvida ? tempoAtualizacao(diasDesde(item.atualizadaEm)) : tempoAberta(item.diasAberta)}
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
                <p className="py-4 text-sm text-destructive">{copy.threadError}</p>
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
                  aria-label={copy.placeholder}
                  rows={2}
                  maxLength={2000}
                  disabled={enviando}
                  className="min-h-[2.5rem] flex-1 resize-none rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-foreground disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => void enviar()}
                  disabled={enviando || !texto.trim()}
                  className="press-feedback flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white transition-opacity disabled:opacity-40"
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

export function ReclamacoesCard({ dados, carregando, semFiltro, scope, acaoSlot }: {
  dados: ReclamacoesResultado | null;
  carregando: boolean;
  semFiltro: boolean;
  scope?: React.ReactNode;
  acaoSlot?: HTMLElement | null;
}) {
  // O selo mostra quantas realmente precisam de resposta nossa, não o total
  // de casos em aberto no ML — o título é "Reclamações a resolver", contar
  // as já resolvidas (só aguardando o ML encerrar) infla o número à toa.
  const pendentes = !semFiltro ? (dados?.pendentes ?? 0) : 0;
  const totalAnimado = useContagem(pendentes);
  const [aberta, setAberta] = useState<string | null>(null);

  const contagem = pendentes > 0 ? (
    <span
      className="rounded-full px-2 py-0.5 text-xs font-bold tabular-nums"
      style={{ background: tint(copy.accent, 10), color: copy.accent }}
    >
      {Math.round(totalAnimado)}
    </span>
  ) : null;

  return (
    <Card>
      <CardHead scope={scope} />
      {acaoSlot && contagem && createPortal(contagem, acaoSlot)}

      {semFiltro && (
        <EmptyState
          illustration="complaints"
          title="Selecione um filtro"
          description="Escolha uma marca acima para ver as reclamações."
        />
      )}

      {!semFiltro && carregando && <Esqueleto />}

      {!semFiltro && !carregando && dados?.semContaConectada && (
        <EmptyState
          illustration="complaints"
          title={copy.disconnectedTitle}
          description={copy.disconnectedDescription}
        />
      )}

      {!semFiltro && !carregando && dados && !dados.semContaConectada && dados.itens.length === 0 && (
        <EmptyState
          illustration="complaints"
          title={copy.emptyTitle}
          description={copy.emptyDescription}
        />
      )}

      {!semFiltro && !carregando && dados && dados.itens.length > 0 && (
        <>
          {dados.marcasComFalha.length > 0 && (
            <p className="mx-5 mt-3 rounded-lg bg-warning/10 px-3 py-2 text-[11px] font-medium text-warning">
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
