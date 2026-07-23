"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { X, Plus, Trash2, Link2 } from "lucide-react";
import { ChannelLogo } from "@/shared/design-system/primitives/ChannelLogo";
import {
  actionListarContasCanal,
  actionListarMapeamentosCanal,
  actionSalvarMapeamentoCanal,
  actionRemoverMapeamentoCanal,
} from "./actions";
import { inputClass, selectClass } from "@/shared/design-system/primitives/WizardLayout";
import pagesConfig from "@/config/pages.json";

const copy = pagesConfig.estoque.channels;

type ContaCanal = { id: string; tipo: string; nome: string; status: string; brandId: string };
type Mapeamento = { id: string; channelAccountId: string; externalListingId: string; externalSkuId: string | null; externalWarehouseId: string | null; ativo: boolean; contaTipo: string; contaNome: string };

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
  const [, startTransition]           = useTransition();

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

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
        style={{ background: "rgba(14,15,19,0.6)", backdropFilter: "blur(4px)" }}
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 32, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.97 }}
          transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
          className="w-full max-w-lg bg-card rounded-[1.25rem] shadow-[0_8px_40px_rgba(14,15,19,.18)] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-[0.5rem] flex items-center justify-center text-base"
                   style={{ background: "var(--gradient-signature)" }}>
                <Link2 size={15} color="white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground leading-tight">{copy.title}</p>
                <p className="text-xs text-muted-foreground">{produtoNome}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label={copy.close}
              className="w-8 h-8 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-5">

            {/* Mapeamentos existentes */}
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                {copy.activeMappings}
              </p>
              {loading ? (
                <div className="space-y-2">
                  {[1,2].map(i => (
                    <div key={i} className="h-12 rounded-[0.75rem] bg-muted animate-pulse" />
                  ))}
                </div>
              ) : mapeamentos.filter(m => m.ativo).length === 0 ? (
                <div className="rounded-[0.75rem] border border-dashed border-border py-6 text-center">
                  <p className="text-sm text-muted-foreground">{copy.emptyTitle}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{copy.emptyDescription}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {mapeamentos.filter(m => m.ativo).map((m) => (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-center gap-3 px-4 py-3 rounded-[0.75rem] bg-muted/50 border border-border"
                    >
                      <ChannelLogo canal={m.contaTipo} size="sm" variant="logo" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{m.contaNome}</p>
                        <p className="text-xs text-muted-foreground font-mono truncate">{m.externalListingId}</p>
                        {m.externalSkuId && <p className="text-[11px] text-muted-foreground font-mono truncate">{copy.skuPrefix} {m.externalSkuId}</p>}
                      </div>
                      <button
                        onClick={() => remover(m.id)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-[#C21820] hover:bg-[#C2182014] transition-colors"
                        title={copy.removeTitle}
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
                  <select
                    className={selectClass}
                    value={novaContaId}
                    onChange={(e) => setNovaContaId(e.target.value)}
                  >
                    <option value="">{copy.accountPlaceholder}</option>
                    {contasDisponiveis.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome} ({c.tipo})
                        {c.status !== "conectado" ? ` ${copy.disconnectedSuffix}` : ""}
                      </option>
                    ))}
                  </select>
                  <input
                    className={inputClass}
                    placeholder={copy.listingPlaceholder}
                    value={novoListingId}
                    onChange={(e) => setNovoListingId(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && salvar()}
                  />
                  {(contas.find((item) => item.id === novaContaId)?.tipo === "tiktokshop" || contas.find((item) => item.id === novaContaId)?.tipo === "shopee") && (
                    <input
                      className={inputClass}
                      placeholder={copy.skuPlaceholder}
                      value={novoSkuId}
                      onChange={(e) => setNovoSkuId(e.target.value)}
                    />
                  )}
                  {contas.find((item) => item.id === novaContaId)?.tipo === "tiktokshop" && (
                    <input
                      className={inputClass}
                      placeholder={copy.warehousePlaceholder}
                      value={novoWarehouseId}
                      onChange={(e) => setNovoWarehouseId(e.target.value)}
                    />
                  )}
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={salvar}
                    className="w-full h-10 flex items-center justify-center gap-2 rounded-[0.75rem] text-sm font-semibold text-white"
                    style={{ background: "var(--gradient-signature)" }}
                  >
                    <Plus size={15} />
                    {copy.save}
                  </motion.button>
                </div>
              </div>
            )}

            {contasDisponiveis.length === 0 && !loading && (
              <p className="text-xs text-muted-foreground text-center py-2">
                {copy.allMapped}
              </p>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
