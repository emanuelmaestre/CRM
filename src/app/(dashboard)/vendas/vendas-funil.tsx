"use client";

import { useState, useEffect, useTransition, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { motion, useReducedMotion } from "framer-motion";
import { FileText, Trash2, Building2, Inbox } from "lucide-react";
import {
  actionAnalisarGargalosFunil, actionCriarEtapasPadrao, actionExcluirOportunidade, actionGerarPropostaOportunidade,
  actionListarFunil, actionListarReferenciasFunil, actionMoverOportunidade,
} from "./actions";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { BrandLogo } from "@/shared/design-system/primitives/BrandLogo";
import pagesConfig from "@/config/pages.json";
import { getBrandConfig, isBrandSlug } from "@/shared/config/brands";

type Etapa = { id: string; nome: string; ordem: number; cor: string | null };
type Oportunidade = {
  id: string; titulo: string; etapaId: string; brandId: string; valor: string | null;
  brandName: string; brandSlug: string;
  clienteNome: string | null; responsavelNome: string | null;
  entrouEtapaEm: string | Date; motivoPerda: string | null;
};
type MarcaRef = { id: string; nome: string; slug: string };

const copy = pagesConfig.vendas;

function brandLabel(opportunity: Oportunidade) {
  return {
    label: opportunity.brandName,
    color: getBrandConfig(opportunity.brandSlug)?.color ?? "var(--muted-foreground)",
  };
}

function diasNaEtapa(entrouEtapaEm: string | Date): number {
  return Math.floor((Date.now() - new Date(entrouEtapaEm).getTime()) / 86_400_000);
}

function etapaAgeLabel(entrouEtapaEm: string | Date): string {
  const dias = diasNaEtapa(entrouEtapaEm);
  return dias <= 0 ? copy.stageAge.today : `${dias}d ${copy.stageAge.suffix}`;
}

type Gargalo = {
  etapaId: string; etapaNome: string; oportunidadesParadas: number;
  mediaDiasParada: number; maiorEsperaDias: number;
};

function GargalosFunil() {
  const gc = pagesConfig.vendas.gargalos;
  const [gargalos, setGargalos] = useState<Gargalo[] | null>(null);

  useEffect(() => {
    actionAnalisarGargalosFunil().then(setGargalos).catch(() => setGargalos([]));
  }, []);

  const comOportunidades = gargalos?.filter((g) => g.oportunidadesParadas > 0) ?? [];
  if (gargalos === null || comOportunidades.length === 0) return null;

  return (
    <section className="mb-4 rounded-[1.25rem] border border-border bg-card overflow-hidden" data-testid="gargalos-funil">
      <div className="px-5 py-3 border-b border-border">
        <h2 className="text-sm font-semibold">{gc.title}</h2>
        <p className="text-xs text-muted-foreground">{gc.subtitle}</p>
      </div>
      <div className="divide-y divide-border">
        {comOportunidades.map((g) => (
          <div key={g.etapaId} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
            <span className="font-medium">{g.etapaNome}</span>
            <span className="text-xs text-muted-foreground">
              {g.oportunidadesParadas} {gc.stuckSuffix} · {gc.avgLabel} {g.mediaDiasParada}d · {gc.maxLabel} {g.maiorEsperaDias}d
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Pílula de marca ────────────────────────────────────────────
   Mesmo tratamento visual do Estoque/Pedidos: o funil é compartilhado pelas
   três marcas, e sem filtro nenhum um board com volume real vira uma sopa.
   Contagem vem do que já está carregado (o funil inteiro cabe em memória,
   ao contrário do catálogo de produtos) — sem round-trip extra ao servidor. */
function MarcaPill({ marca, total, ativo, onClick }: { marca: MarcaRef; total: number; ativo: boolean; onClick: () => void }) {
  const reduzir = useReducedMotion();
  const { slug } = marca;
  const vazia = total === 0;
  const bloqueada = vazia && !ativo;
  // Precisa da variável local `slug` para o narrowing persistir até o uso
  // abaixo — checar marca.slug direto não sobrevive entre statements.
  const temIdentidade = isBrandSlug(slug);
  const cor = getBrandConfig(slug)?.color ?? "var(--foreground)";

  return (
    <motion.button
      type="button"
      onClick={bloqueada ? undefined : onClick}
      disabled={bloqueada}
      whileHover={!bloqueada && !reduzir ? { y: -1 } : undefined}
      whileTap={!bloqueada && !reduzir ? { scale: 0.97 } : undefined}
      aria-pressed={ativo}
      aria-label={marca.nome}
      title={bloqueada ? copy.brandSelector.emptyHint.replace("{marca}", marca.nome) : undefined}
      className={`inline-flex h-9 items-center gap-2 rounded-full px-3.5 transition-colors ${
        bloqueada
          ? "border border-border opacity-40 cursor-not-allowed"
          : ativo
            ? "border-2 bg-card/70"
            : "border border-border/80 bg-card/40 hover:bg-card/70"
      }`}
      style={ativo ? { borderColor: cor } : undefined}
    >
      {temIdentidade
        ? <BrandLogo brand={slug} height={15} />
        : <span className="text-[13px] font-semibold text-foreground">{marca.nome}</span>}
      <span className="text-[11px] tabular-nums text-muted-foreground">{total}</span>
    </motion.button>
  );
}

/* ── Confirmação de perda ──────────────────────────────────────
   Substitui o window.prompt() nativo — único ponto do app inteiro que
   coletava dado persistido por um prompt de navegador em vez de um campo
   estilizado. O motivo some para sempre depois de digitado ali: aqui ele
   fica visível no próprio card (ver renderização abaixo), então vale um
   campo de verdade, não uma caixinha do sistema operacional. */
function ConfirmarPerdaModal({ titulo, onConfirm, onCancel, pending }: {
  titulo: string;
  onConfirm: (motivo: string) => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const lm = copy.lossModal;
  const [motivo, setMotivo] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/40 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-sm sm:items-center sm:p-4">
      <div role="dialog" aria-modal="true" className="max-h-[calc(100dvh-1.5rem)] w-full max-w-sm overflow-y-auto rounded-[1.25rem] border border-border bg-card p-4 shadow-xl sm:p-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base font-semibold text-foreground">{lm.title}</h2>
          <button type="button" onClick={onCancel} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
        </div>
        <p className="text-sm text-muted-foreground mb-1 font-medium">{titulo}</p>
        <p className="text-xs text-muted-foreground mb-4">{lm.description}</p>

        <form
          onSubmit={(e) => { e.preventDefault(); if (motivo.trim().length >= 3) onConfirm(motivo.trim()); }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">{lm.reasonLabel}</label>
            <textarea
              value={motivo}
              onChange={(event) => setMotivo(event.target.value)}
              placeholder={lm.reasonPlaceholder}
              rows={3}
              autoFocus
              className="w-full resize-none rounded-[0.75rem] border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex flex-col-reverse gap-3 min-[380px]:flex-row">
            <button type="button" onClick={onCancel} className="flex-1 h-10 rounded-[0.75rem] border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors">
              {lm.cancel}
            </button>
            <button
              type="submit"
              disabled={pending || motivo.trim().length < 3}
              className="flex-1 h-10 rounded-[0.75rem] text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: "var(--gradient-signature)" }}
            >
              {lm.confirm}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function VendasFunil() {
  const router = useRouter();
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [oportunidades, setOportunidades] = useState<Oportunidade[]>([]);
  const [marcasRef, setMarcasRef] = useState<MarcaRef[]>([]);
  const [brandId, setBrandId] = useState("");
  const [loading, setLoading] = useState(true);
  const [canConfigure, setCanConfigure] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [dragOverEtapaId, setDragOverEtapaId] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const carregar = useCallback(() => {
    startTransition(async () => {
      setLoading(true);
      try {
        const [res, refs] = await Promise.all([actionListarFunil(), actionListarReferenciasFunil()]);
        setEtapas(res.etapas as Etapa[]);
        setOportunidades(res.oportunidades as Oportunidade[]);
        setMarcasRef(refs.marcas as MarcaRef[]);
        setCanConfigure(res.permissions.canConfigure);
        setCanDelete(res.permissions.canDelete);
      } catch {
        toast.error(copy.messages.loadError);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Contagem por marca, cruzada com o que está de fato no funil — igual ao
  // par Estoque/Pedidos: a pílula nunca promete um número que o board não tem.
  const contagemPorMarca = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const op of oportunidades) mapa.set(op.brandId, (mapa.get(op.brandId) ?? 0) + 1);
    return mapa;
  }, [oportunidades]);

  const oportunidadesFiltradas = brandId
    ? oportunidades.filter((o) => o.brandId === brandId)
    : oportunidades;

  const [confirmandoPerda, setConfirmandoPerda] = useState<{ opId: string; etapaId: string; titulo: string } | null>(null);
  const [movendo, setMovendo] = useState(false);

  async function executarMovimento(opId: string, novaEtapaId: string, motivoPerda?: string) {
    try {
      await actionMoverOportunidade(opId, novaEtapaId, motivoPerda);
      setOportunidades((prev) => prev.map((o) => o.id === opId
        ? { ...o, etapaId: novaEtapaId, motivoPerda: motivoPerda ?? o.motivoPerda }
        : o));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : copy.messages.moveError);
    }
  }

  function mover(opId: string, novaEtapaId: string) {
    const etapaAtual = oportunidades.find((o) => o.id === opId)?.etapaId;
    if (etapaAtual === novaEtapaId) return;
    const etapaAlvo = etapas.find((e) => e.id === novaEtapaId);
    if (etapaAlvo?.nome.trim().toLowerCase() === "perdida") {
      const titulo = oportunidades.find((o) => o.id === opId)?.titulo ?? "";
      setConfirmandoPerda({ opId, etapaId: novaEtapaId, titulo });
      return;
    }
    executarMovimento(opId, novaEtapaId);
  }

  async function confirmarPerda(motivo: string) {
    if (!confirmandoPerda) return;
    setMovendo(true);
    try {
      await executarMovimento(confirmandoPerda.opId, confirmandoPerda.etapaId, motivo);
      setConfirmandoPerda(null);
    } finally {
      setMovendo(false);
    }
  }

  async function configurarFunil() {
    try {
      await actionCriarEtapasPadrao();
      toast.success(copy.messages.setupSuccess);
      carregar();
    } catch {
      toast.error(copy.messages.setupError);
    }
  }

  const [gerandoProposta, setGerandoProposta] = useState<string | null>(null);

  async function gerarProposta(opId: string) {
    setGerandoProposta(opId);
    try {
      const doc = await actionGerarPropostaOportunidade(opId);
      window.open(doc.storageUrl, "_blank");
      toast.success(copy.messages.proposalSuccess);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : copy.messages.proposalError);
    } finally {
      setGerandoProposta(null);
    }
  }

  async function excluir(opId: string, titulo: string) {
    if (!confirm(copy.actions.deleteConfirm.replace("{title}", titulo))) return;
    try {
      await actionExcluirOportunidade(opId);
      setOportunidades((current) => current.filter((item) => item.id !== opId));
      toast.success(copy.messages.deleteSuccess);
    } catch {
      toast.error(copy.messages.deleteError);
    }
  }

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex justify-end mb-6"
      >
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => router.push("/vendas/nova")}
          className="h-10 px-4 rounded-[0.75rem] text-sm font-semibold text-white shadow-[0_4px_14px_rgba(227,19,27,.3)]"
          style={{ background: "var(--gradient-signature)" }}
        >
          {copy.newAction}
        </motion.button>
      </motion.div>

      {!loading && etapas.length > 0 && <GargalosFunil />}

      {!loading && etapas.length > 0 && marcasRef.length > 1 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-full border border-border/60 bg-card/40 px-3.5 py-2 w-fit">
          <span className="inline-flex flex-shrink-0 items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Building2 size={12} strokeWidth={2.25} /> {copy.brandSelector.label}
          </span>
          {marcasRef.map((marca) => (
            <MarcaPill
              key={marca.id}
              marca={marca}
              total={contagemPorMarca.get(marca.id) ?? 0}
              ativo={brandId === marca.id}
              onClick={() => setBrandId((atual) => atual === marca.id ? "" : marca.id)}
            />
          ))}
        </div>
      )}

      {loading ? (
        <div className="text-center text-sm text-muted-foreground py-12">{copy.loading}</div>
      ) : etapas.length === 0 ? (
        <div className="rounded-[1.25rem] border border-border bg-card">
          <EmptyState
            illustration="funnel"
            title={copy.empty.title}
            description={copy.empty.description}
            action={canConfigure ? <button type="button" onClick={configurarFunil} className="min-h-11 px-5 rounded-xl text-sm font-semibold text-white" style={{ background: "var(--gradient-signature)" }}>{copy.actions.setup}</button> : undefined}
          />
        </div>
      ) : (
        // Grid em vez de trilho com scroll horizontal: a partir de lg, as
        // colunas dividem a largura disponível em frações iguais (1fr cada)
        // e cabem todas de uma vez, sem barra de rolagem. Abaixo de lg — onde
        // squeezar 5 colunas ficaria ilegível — mantém o scroll horizontal
        // por toque, que é o padrão esperado num board em tela pequena.
        <div
          className="flex gap-4 overflow-x-auto pb-4 lg:grid lg:overflow-visible lg:pb-0"
          style={{ gridTemplateColumns: `repeat(${etapas.length}, minmax(0, 1fr))` }}
        >
          {etapas.map((etapa, indice) => {
            const ops = oportunidadesFiltradas.filter((o) => o.etapaId === etapa.id);
            const total = ops.reduce((s, o) => s + (o.valor ? Number(o.valor) : 0), 0);
            const ehPerdida = etapa.nome.trim().toLowerCase() === "perdida";
            const emFoco = dragOverEtapaId === etapa.id;
            const cor = etapa.cor || "var(--muted-foreground)";
            return (
              <motion.div
                key={etapa.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: indice * 0.04 }}
                className="min-w-[85vw] sm:min-w-72 lg:min-w-0 flex-shrink-0 lg:flex-shrink rounded-[1.25rem] bg-card shadow-[0_2px_16px_rgba(14,15,19,.07)] transition-[box-shadow,outline-color] outline outline-2"
                style={{ outlineColor: emFoco ? cor : "transparent", boxShadow: emFoco ? `0 4px 20px ${cor}26` : "0 2px 16px rgba(14,15,19,.07)" }}
                onDragOver={(e) => { e.preventDefault(); setDragOverEtapaId(etapa.id); }}
                onDragLeave={() => setDragOverEtapaId((atual) => atual === etapa.id ? null : atual)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverEtapaId(null);
                  const opId = e.dataTransfer.getData("opId");
                  if (opId) mover(opId, etapa.id);
                }}
              >
                {/* Cabeçalho da etapa */}
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cor }} />
                    <span className="text-sm font-semibold text-foreground truncate">{etapa.nome}</span>
                  </div>
                  <span
                    className="flex-shrink-0 text-[11px] font-semibold tabular-nums rounded-full px-1.5 py-0.5"
                    style={{ background: cor + "1a", color: cor }}
                  >
                    {ops.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="p-3 space-y-2 min-h-[140px]">
                  {ops.length === 0 ? (
                    <motion.div
                      animate={emFoco ? { scale: 1.02, borderColor: cor } : { scale: 1 }}
                      className="flex flex-col items-center justify-center gap-1.5 rounded-[0.75rem] border-2 border-dashed border-border py-7 text-center"
                    >
                      <Inbox size={18} strokeWidth={1.5} className="text-muted-foreground/60" />
                      <p className="text-xs text-muted-foreground px-3">{copy.dropHint}</p>
                    </motion.div>
                  ) : (
                    ops.map((op) => {
                      const brand = brandLabel(op);
                      return (
                        <motion.div
                          key={op.id}
                          layout
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          whileHover={{ y: -1, boxShadow: "0 4px 16px rgba(14,15,19,.09)" }}
                          draggable
                          data-testid={`oportunidade-${op.id}`}
                          onDragStartCapture={(e: React.DragEvent<HTMLDivElement>) => {
                            e.dataTransfer.setData("opId", op.id);
                            setArrastando(op.id);
                          }}
                          onDragEnd={() => setArrastando(null)}
                          className="rounded-[0.75rem] bg-background border border-border p-3 cursor-grab active:cursor-grabbing"
                          style={{ opacity: arrastando === op.id ? 0.4 : 1 }}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium text-foreground leading-tight">{op.titulo}</p>
                            <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
                              {etapaAgeLabel(op.entrouEtapaEm)}
                            </span>
                          </div>
                          {(op.clienteNome || op.responsavelNome) && <p className="text-xs text-muted-foreground mt-1">{op.clienteNome ?? copy.noClient}{op.responsavelNome ? ` · ${op.responsavelNome}` : ""}</p>}
                          {ehPerdida && op.motivoPerda && (
                            <p className="mt-1.5 rounded-lg bg-muted/60 px-2 py-1 text-[11px] leading-snug text-muted-foreground">
                              <span className="font-semibold text-foreground">{copy.lossModal.lossReasonLabel}: </span>
                              {op.motivoPerda}
                            </p>
                          )}
                          <div className="flex items-center justify-between mt-2">
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                              style={{ background: brand.color + "20", color: brand.color }}
                            >
                              {brand.label}
                            </span>
                            {op.valor && (
                              <span className="text-xs text-muted-foreground">
                                R$ {Number(op.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border">
                            <label className="sr-only" htmlFor={`move-${op.id}`}>{copy.actions.move}</label>
                            <select
                              id={`move-${op.id}`}
                              data-testid={`move-${op.id}`}
                              value={op.etapaId}
                              onChange={(event) => mover(op.id, event.target.value)}
                              className="min-h-11 flex-1 rounded-lg border border-border bg-background px-2 text-xs"
                            >
                              {etapas.map((option) => <option key={option.id} value={option.id}>{option.nome}</option>)}
                            </select>
                            <button
                              type="button"
                              onClick={() => gerarProposta(op.id)}
                              disabled={gerandoProposta === op.id}
                              title={copy.actions.generateProposal}
                              className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50"
                            >
                              <FileText size={15} />
                            </button>
                            {canDelete && <button type="button" onClick={() => excluir(op.id, op.titulo)} title={copy.actions.delete} className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"><Trash2 size={15} /></button>}
                          </div>
                        </motion.div>
                      );
                    })
                  )}
                </div>

                {/* Footer da etapa */}
                {total > 0 && (
                  <div className="px-4 py-2 border-t border-border">
                    <span className="text-xs text-muted-foreground">
                      R$ {total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {confirmandoPerda && (
        <ConfirmarPerdaModal
          titulo={confirmandoPerda.titulo}
          pending={movendo}
          onConfirm={confirmarPerda}
          onCancel={() => setConfirmandoPerda(null)}
        />
      )}
    </div>
  );
}
