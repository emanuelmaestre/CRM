"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { X, Plus, Trash2, Link2, Radio, Check, Pencil } from "lucide-react";
import { ChannelLogo } from "@/shared/design-system/primitives/ChannelLogo";
import {
  actionListarContasCanal,
  actionListarMapeamentosCanal,
  actionSalvarMapeamentoCanal,
  actionRemoverMapeamentoCanal,
} from "./actions";
import { inputClass } from "@/shared/design-system/primitives/WizardLayout";
import { listItem, springs, transicao, variantes } from "@/shared/design-system/motion-variants";
import { analisarTituloProduto } from "@/shared/lib/produto-titulo";
import channelsConfig from "@/config/channels.json";
import pagesConfig from "@/config/pages.json";
import { tint } from "@/shared/design-system/color";

const copy = pagesConfig.estoque.channels;

type ContaCanal = { id: string; tipo: string; nome: string; status: string; brandId: string };
type Mapeamento = { id: string; channelAccountId: string; externalListingId: string; externalSkuId: string | null; externalWarehouseId: string | null; ativo: boolean; contaTipo: string; contaNome: string };

function accentDoCanal(tipo: string): string {
  const key = tipo.toLowerCase();
  const item = (channelsConfig.items as Record<string, { accent: string }>)[key];
  return item?.accent ?? channelsConfig.fallback.accent;
}

async function buscarMapeamentos(produtoId: string) {
  return Promise.all([
    actionListarContasCanal(),
    actionListarMapeamentosCanal(produtoId),
  ]);
}

interface Props {
  produtoId: string;
  produtoNome: string;
  onClose: () => void;
}

export function CanalModal({ produtoId, produtoNome, onClose }: Props) {
  const [contas, setContas]           = useState<ContaCanal[]>([]);
  const [mapeamentos, setMapeamentos] = useState<Mapeamento[]>([]);
  const [loading, setLoading]         = useState(true);
  const [novaContaId, setNovaContaId] = useState("");
  const [novoListingId, setNovoListingId] = useState("");
  const [novoSkuId, setNovoSkuId] = useState("");
  const [novoWarehouseId, setNovoWarehouseId] = useState("");
  const [pending, startTransition]    = useTransition();
  // Marca qual conta acabou de ganhar um mapeamento, só para dar o selo de
  // sucesso momentâneo no item recém-criado — some sozinho, não é estado
  // permanente de nada.
  const [recemConectado, setRecemConectado] = useState<string | null>(null);

  useEffect(() => {
    if (!recemConectado) return;
    const timer = setTimeout(() => setRecemConectado(null), 1800);
    return () => clearTimeout(timer);
  }, [recemConectado]);

  const carregar = useCallback(() => {
    setLoading(true);
    buscarMapeamentos(produtoId).then(([c, m]) => {
      setContas(c as ContaCanal[]);
      setMapeamentos(m as Mapeamento[]);
    }).catch(() => toast.error(copy.messages.loadError))
      .finally(() => setLoading(false));
  }, [produtoId]);

  useEffect(() => {
    let ativo = true;

    void buscarMapeamentos(produtoId)
      .then(([c, m]) => {
        if (!ativo) return;
        setContas(c as ContaCanal[]);
        setMapeamentos(m as Mapeamento[]);
      })
      .catch(() => {
        if (ativo) toast.error(copy.messages.loadError);
      })
      .finally(() => {
        if (ativo) setLoading(false);
      });

    return () => {
      ativo = false;
    };
  }, [produtoId]);

  function salvar() {
    if (!novaContaId) { toast.error(copy.messages.accountRequired); return; }
    if (!novoListingId.trim()) { toast.error(copy.messages.listingRequired); return; }

    startTransition(async () => {
      try {
        const conta = contas.find((item) => item.id === novaContaId);
        if (conta?.tipo === "tiktokshop" && (!novoSkuId.trim() || !novoWarehouseId.trim())) {
          toast.error(copy.messages.tiktokIdsRequired);
          return;
        }
        await actionSalvarMapeamentoCanal(
          produtoId,
          novaContaId,
          novoListingId.trim(),
          novoSkuId,
          novoWarehouseId,
        );
        toast.success(copy.messages.saveSuccess);
        setRecemConectado(novaContaId);
        setNovaContaId("");
        setNovoListingId("");
        setNovoSkuId("");
        setNovoWarehouseId("");
        carregar();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : copy.messages.saveError);
      }
    });
  }

  function remover(id: string) {
    startTransition(async () => {
      try {
        await actionRemoverMapeamentoCanal(id);
        toast.success(copy.messages.removeSuccess);
        carregar();
      } catch {
        toast.error(copy.messages.removeError);
      }
    });
  }

  const contasDisponiveis = contas.filter(
    (c) => !mapeamentos.some((m) => m.channelAccountId === c.id && m.ativo),
  );
  const contaSelecionada = contas.find((item) => item.id === novaContaId);
  const nomeExibicao = analisarTituloProduto(produtoNome).produto;
  // Único modal do app cujas transições (todas em JS via Framer Motion) não
  // respeitavam prefers-reduced-motion — a regra CSS global não cobre isso.
  const reduzir = useReducedMotion();

  return (
    <AnimatePresence>
      <motion.div
        initial={reduzir ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={transicao(reduzir, { duration: 0.18 })}
        className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:items-center sm:p-4"
        style={{ background: "rgba(14,15,19,0.6)", backdropFilter: "blur(4px)" }}
        onClick={onClose}
      >
        <motion.div
          initial={reduzir ? false : { opacity: 0, y: 32, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.97 }}
          // springs.drawer: mesmo spring nomeado do design system para
          // "sobe de baixo e assenta com uma leve sobra" — antes era uma
          // duração/easing digitados à mão, fora do vocabulário do resto do
          // app.
          transition={transicao(reduzir, springs.drawer)}
          role="dialog"
          aria-modal="true"
          className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-[1.25rem] bg-card shadow-[0_8px_40px_rgba(14,15,19,.18)]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="w-8 h-8 rounded-[0.5rem] flex items-center justify-center shrink-0"
                   style={{ background: "var(--gradient-signature)" }}>
                <Link2 size={15} color="white" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground leading-tight">{copy.title}</p>
                <p className="truncate text-xs text-muted-foreground">{nomeExibicao}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label={copy.close}
              className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">

            {/* Mapeamentos existentes */}
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                {copy.activeMappings}
              </p>
              {loading ? (
                <div className="space-y-2">
                  {[1,2].map(i => (
                    <div key={i} className="h-14 rounded-[0.75rem] bg-muted animate-pulse" />
                  ))}
                </div>
              ) : mapeamentos.filter(m => m.ativo).length === 0 ? (
                <div className="rounded-[0.75rem] border border-dashed border-border py-6 text-center">
                  <Radio size={18} className="mx-auto mb-2 text-muted-foreground" strokeWidth={1.75} />
                  <p className="text-sm text-muted-foreground">{copy.emptyTitle}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{copy.emptyDescription}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {mapeamentos.filter(m => m.ativo).map((m) => (
                    <motion.div
                      key={m.id}
                      variants={variantes(reduzir, listItem)}
                      initial="hidden"
                      animate="show"
                      className="flex items-center gap-3 pl-3 pr-2 py-3 rounded-[0.75rem] bg-muted/50 border border-border"
                      style={{ borderLeft: `3px solid ${accentDoCanal(m.contaTipo)}` }}
                    >
                      <ChannelLogo canal={m.contaTipo} size="sm" variant="logo" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{m.contaNome}</p>
                        <p className="text-xs text-muted-foreground font-mono truncate">{m.externalListingId}</p>
                        {m.externalSkuId && <p className="text-[11px] text-muted-foreground font-mono truncate">{copy.skuPrefix} {m.externalSkuId}</p>}
                      </div>
                      <AnimatePresence>
                        {recemConectado === m.channelAccountId && (
                          <motion.span
                            initial={reduzir ? false : { opacity: 0, scale: 0.6 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            transition={transicao(reduzir, springs.settle)}
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                            style={{ background: "var(--success)", color: "white" }}
                            aria-hidden="true"
                          >
                            <Check size={13} strokeWidth={3} />
                          </motion.span>
                        )}
                      </AnimatePresence>
                      <button
                        onClick={() => remover(m.id)}
                        disabled={pending}
                        className="flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-destructive/8 hover:text-destructive disabled:opacity-50"
                        title={copy.removeTitle}
                        aria-label={`${copy.removeTitle} — ${m.contaNome}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {/* Adicionar novo */}
            {contasDisponiveis.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                  {copy.addTitle}
                </p>
                <div className="space-y-3">
                  <div>
                    <p className="mb-2 text-xs font-medium text-muted-foreground">{copy.accountFieldLabel}</p>

                    {/* Depois de escolhida, a conta vira um resumo de uma linha —
                        a grade inteira ficando aberta só empurrava os campos de
                        digitação (ID do anúncio etc.) pra fora da tela. */}
                    {contaSelecionada ? (
                      <div
                        className="flex items-center gap-2.5 rounded-[0.75rem] border px-3 py-2.5"
                        style={{ borderColor: "var(--selecionado)", background: tint("var(--selecionado)", 7) }}
                      >
                        <ChannelLogo canal={contaSelecionada.tipo} size="sm" variant="logo" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-foreground truncate">{contaSelecionada.nome}</p>
                          {contaSelecionada.status !== "conectado" && (
                            <p className="text-[10px] text-destructive">{copy.disconnectedSuffix.replace("— ", "")}</p>
                          )}
                        </div>
                        <Check size={14} className="shrink-0" style={{ color: "var(--selecionado)" }} strokeWidth={2.5} />
                        <button
                          type="button"
                          onClick={() => setNovaContaId("")}
                          className="inline-flex items-center gap-1 shrink-0 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Pencil size={14} /> {copy.changeAccount}
                        </button>
                      </div>
                    ) : (
                      <div className={`grid gap-2 ${contasDisponiveis.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
                        {contasDisponiveis.map((c) => {
                          const desconectada = c.status !== "conectado";
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => setNovaContaId(c.id)}
                              className="flex items-center gap-2.5 rounded-[0.75rem] border border-border px-3 py-2.5 text-left transition-colors hover:border-[rgba(155,48,217,.4)] hover:bg-muted"
                            >
                              <ChannelLogo canal={c.tipo} size="sm" variant="logo" />
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold text-foreground truncate">{c.nome}</p>
                                {desconectada && (
                                  <p className="text-[10px] text-destructive">{copy.disconnectedSuffix.replace("— ", "")}</p>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <AnimatePresence>
                    {novaContaId && (
                      <motion.div
                        initial={reduzir ? false : { opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={transicao(reduzir, springs.settle)}
                        className="space-y-3 overflow-hidden"
                      >
                        <div>
                          <label htmlFor="canal-listing-id" className="block text-xs font-medium text-muted-foreground mb-1.5">{copy.listingFieldLabel}</label>
                          <input
                            id="canal-listing-id"
                            className={inputClass}
                            placeholder={copy.listingPlaceholder}
                            value={novoListingId}
                            onChange={(e) => setNovoListingId(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && salvar()}
                            autoFocus
                          />
                        </div>
                        {(contaSelecionada?.tipo === "tiktokshop" || contaSelecionada?.tipo === "shopee") && (
                          <div>
                            <label htmlFor="canal-sku-id" className="block text-xs font-medium text-muted-foreground mb-1.5">{copy.skuFieldLabel}</label>
                            <input
                              id="canal-sku-id"
                              className={inputClass}
                              placeholder={copy.skuPlaceholder}
                              value={novoSkuId}
                              onChange={(e) => setNovoSkuId(e.target.value)}
                            />
                          </div>
                        )}
                        {contaSelecionada?.tipo === "tiktokshop" && (
                          <div>
                            <label htmlFor="canal-warehouse-id" className="block text-xs font-medium text-muted-foreground mb-1.5">{copy.warehouseFieldLabel}</label>
                            <input
                              id="canal-warehouse-id"
                              className={inputClass}
                              placeholder={copy.warehousePlaceholder}
                              value={novoWarehouseId}
                              onChange={(e) => setNovoWarehouseId(e.target.value)}
                            />
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <motion.button
                    whileHover={reduzir || pending || !novaContaId ? undefined : { scale: 1.02 }}
                    whileTap={reduzir || pending || !novaContaId ? undefined : { scale: 0.97 }}
                    onClick={salvar}
                    disabled={pending || !novaContaId}
                    className="w-full h-11 flex items-center justify-center gap-2 rounded-[0.75rem] text-sm font-semibold text-white disabled:opacity-40"
                    style={{ background: "var(--gradient-signature)" }}
                  >
                    <Plus size={15} />
                    {pending ? copy.saving : copy.save}
                  </motion.button>
                </div>
              </div>
            )}

            {contasDisponiveis.length === 0 && !loading && (
              <div className="rounded-[0.75rem] border border-dashed border-border py-6 text-center px-4">
                <Link2 size={18} className="mx-auto mb-2 text-muted-foreground" strokeWidth={1.75} />
                <p className="text-xs text-muted-foreground">{copy.allMapped}</p>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
