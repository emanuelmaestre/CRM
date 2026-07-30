"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { FileText, Trash2 } from "lucide-react";
import {
  actionAnalisarGargalosFunil, actionCriarEtapasPadrao, actionExcluirOportunidade, actionGerarPropostaOportunidade,
  actionListarFunil, actionMoverOportunidade,
} from "./actions";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import brandsConfig from "@/config/brands.json";
import pagesConfig from "@/config/pages.json";

type Etapa = { id: string; nome: string; ordem: number; cor: string | null };
type Oportunidade = {
  id: string; titulo: string; etapaId: string; brandId: string; valor: string | null;
  clienteNome: string | null; responsavelNome: string | null;
};

const BRAND_KARZI = process.env.NEXT_PUBLIC_BRAND_ID_KARZI ?? "";
const BRAND_WUWU = process.env.NEXT_PUBLIC_BRAND_ID_WUWU ?? "";
const copy = pagesConfig.vendas;

function brandLabel(brandId: string) {
  if (brandId === BRAND_KARZI) return { label: brandsConfig.karzi.label, color: brandsConfig.karzi.color };
  if (brandId === BRAND_WUWU) return { label: brandsConfig.wuwu.label, color: brandsConfig.wuwu.color };
  return { label: "—", color: "var(--muted-foreground)" };
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

export function VendasFunil() {
  const router = useRouter();
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [oportunidades, setOportunidades] = useState<Oportunidade[]>([]);
  const [loading, setLoading] = useState(true);
  const [canConfigure, setCanConfigure] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [, startTransition] = useTransition();

  const carregar = useCallback(() => {
    startTransition(async () => {
      setLoading(true);
      try {
        const res = await actionListarFunil();
        setEtapas(res.etapas as Etapa[]);
        setOportunidades(res.oportunidades as Oportunidade[]);
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

  async function mover(opId: string, novaEtapaId: string) {
    const etapaAlvo = etapas.find((e) => e.id === novaEtapaId);
    let motivoPerda: string | undefined;
    if (etapaAlvo?.nome.trim().toLowerCase() === "perdida") {
      const informado = window.prompt(copy.labels.lossReasonPrompt ?? "Motivo da perda:");
      if (!informado || informado.trim().length < 3) {
        if (informado !== null) toast.error(copy.messages.lossReasonRequired);
        return;
      }
      motivoPerda = informado.trim();
    }
    try {
      await actionMoverOportunidade(opId, novaEtapaId, motivoPerda);
      setOportunidades((prev) => prev.map((o) => o.id === opId ? { ...o, etapaId: novaEtapaId } : o));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : copy.messages.moveError);
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
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6"
      >
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "var(--font-sora)" }}>
            {copy.title}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{copy.description}</p>
        </div>
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
        <div className="flex gap-4 overflow-x-auto pb-4">
          {etapas.map((etapa) => {
            const ops = oportunidades.filter((o) => o.etapaId === etapa.id);
            const total = ops.reduce((s, o) => s + (o.valor ? Number(o.valor) : 0), 0);
            return (
              <div
                key={etapa.id}
                className="flex-shrink-0 w-[85vw] sm:w-72 rounded-[1.25rem] bg-card shadow-[0_2px_16px_rgba(14,15,19,.07)]"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const opId = e.dataTransfer.getData("opId");
                  if (opId) mover(opId, etapa.id);
                }}
              >
                {/* Cabeçalho da etapa */}
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ background: etapa.cor || "var(--muted-foreground)" }}
                    />
                    <span className="text-sm font-semibold text-foreground">{etapa.nome}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{ops.length}</span>
                </div>

                {/* Cards */}
                <div className="p-3 space-y-2 min-h-[120px]">
                  {ops.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">{copy.dropHint}</p>
                  ) : (
                    ops.map((op) => {
                      const brand = brandLabel(op.brandId);
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
                          }}
                          className="rounded-[0.75rem] bg-background border border-border p-3 cursor-grab"
                        >
                          <p className="text-sm font-medium text-foreground leading-tight">{op.titulo}</p>
                          {(op.clienteNome || op.responsavelNome) && <p className="text-xs text-muted-foreground mt-1">{op.clienteNome ?? copy.noClient}{op.responsavelNome ? ` · ${op.responsavelNome}` : ""}</p>}
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
