"use client";

import { useMemo, useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { ArrowLeftRight, Check, TrendingDown, TrendingUp, Wrench, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { actionRegistrarMovimento } from "./actions";
import { inputClass } from "@/shared/design-system/primitives/WizardLayout";
import pagesConfig from "@/config/pages.json";

const copy = pagesConfig.estoque.movement;

type Tipo = "entrada" | "saida" | "ajuste";

const TIPO_INFO: Record<Tipo, { icon: LucideIcon; color: string; sinal: string }> = {
  entrada: { icon: TrendingUp, color: "#1F8A4C", sinal: "+" },
  saida: { icon: TrendingDown, color: "#C21820", sinal: "−" },
  ajuste: { icon: Wrench, color: "#2563EB", sinal: "=" },
};

interface Props {
  produtoId: string;
  produtoNome: string;
  saldoAtual: number;
  onSuccess: () => void;
}

export function MovimentoModal({ produtoId, produtoNome, saldoAtual, onSuccess }: Props) {
  const [open, setOpen] = useState(false);
  const [tipo, setTipo] = useState<Tipo>("entrada");
  const [quantidade, setQuantidade] = useState("");
  const [observacao, setObservacao] = useState("");
  const [pending, startTransition] = useTransition();

  const qtd = Number(quantidade);
  const qtdValida = quantidade.trim() !== "" && Number.isFinite(qtd) && qtd > 0;
  const saldoInsuficiente = tipo === "saida" && qtdValida && qtd > saldoAtual;

  const novoSaldo = useMemo(() => {
    if (!qtdValida) return saldoAtual;
    if (tipo === "entrada") return saldoAtual + qtd;
    if (tipo === "saida") return saldoAtual - qtd;
    return qtd;
  }, [tipo, qtd, qtdValida, saldoAtual]);

  function fechar() {
    setOpen(false);
    setTipo("entrada");
    setQuantidade("");
    setObservacao("");
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!qtdValida || saldoInsuficiente) return;

    startTransition(async () => {
      try {
        await actionRegistrarMovimento(produtoId, tipo, qtd, observacao.trim() || undefined);
        toast.success(copy.success);
        fechar();
        onSuccess();
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : copy.error);
      }
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={copy.button.replace("+ ", "")}
        aria-label={copy.button.replace("+ ", "")}
        className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-border bg-card text-foreground shadow-[0_1px_2px_rgba(14,15,19,.05)] transition-colors hover:border-[rgba(155,48,217,.4)] hover:bg-muted active:scale-[.97]"
      >
        <ArrowLeftRight size={14} strokeWidth={2} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:items-center sm:p-4"
            style={{ background: "rgba(14,15,19,0.6)", backdropFilter: "blur(4px)" }}
            onClick={fechar}
          >
            <motion.div
              initial={{ opacity: 0, y: 32, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.97 }}
              transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
              role="dialog"
              aria-modal="true"
              className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-[1.25rem] bg-card shadow-[0_8px_40px_rgba(14,15,19,.18)]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-6">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div
                    className="h-8 w-8 shrink-0 rounded-[0.5rem] flex items-center justify-center"
                    style={{ background: "var(--gradient-signature)" }}
                  >
                    <ArrowLeftRight size={15} color="white" />
                  </div>
                  <p className="truncate text-sm font-semibold text-foreground">{copy.title}</p>
                </div>
                <button
                  onClick={fechar}
                  aria-label={copy.cancel}
                  className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Body */}
              <form onSubmit={handleSubmit} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <div className="space-y-5 px-4 py-5 sm:px-6">
                  <p className="text-sm font-medium text-foreground">{produtoNome}</p>

                  {/* Saldo atual → novo saldo */}
                  <div className="flex items-center gap-3 rounded-[0.75rem] border border-border bg-muted/50 px-4 py-3">
                    <div className="flex-1 text-center">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{copy.balancePrefix}</p>
                      <p className="text-lg font-semibold text-foreground tabular-nums">{saldoAtual}</p>
                    </div>
                    <ArrowLeftRight size={14} className="text-muted-foreground shrink-0" />
                    <div className="flex-1 text-center">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{copy.resultPrefix}</p>
                      <p
                        className="text-lg font-semibold tabular-nums"
                        style={{ color: qtdValida && !saldoInsuficiente ? TIPO_INFO[tipo].color : "var(--foreground)" }}
                      >
                        {novoSaldo}
                      </p>
                    </div>
                  </div>

                  {/* Tipo — cartões seletores */}
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-2">{copy.fields.type} *</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(Object.keys(TIPO_INFO) as Tipo[]).map((valor) => {
                        const info = TIPO_INFO[valor];
                        const meta = copy.types[valor];
                        const Icon = info.icon;
                        const ativo = tipo === valor;
                        return (
                          <button
                            key={valor}
                            type="button"
                            onClick={() => setTipo(valor)}
                            aria-pressed={ativo}
                            className="flex flex-col items-center gap-1.5 rounded-[0.75rem] border px-2 py-3 text-center transition-colors"
                            style={ativo
                              ? { borderColor: info.color, background: `${info.color}14` }
                              : { borderColor: "var(--border)" }}
                          >
                            <Icon size={17} strokeWidth={2.25} color={ativo ? info.color : "var(--muted-foreground)"} />
                            <span
                              className="text-xs font-semibold"
                              style={{ color: ativo ? info.color : "var(--foreground)" }}
                            >
                              {meta.label}
                            </span>
                            <span className="text-[10px] leading-tight text-muted-foreground">{meta.description}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Quantidade */}
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">{copy.fields.quantity} *</label>
                    <div className="relative">
                      <span
                        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold tabular-nums"
                        style={{ color: TIPO_INFO[tipo].color }}
                      >
                        {TIPO_INFO[tipo].sinal}
                      </span>
                      <input
                        value={quantidade}
                        onChange={(e) => setQuantidade(e.target.value)}
                        type="number"
                        min="1"
                        step="1"
                        inputMode="numeric"
                        required
                        autoFocus
                        className={`${inputClass} pl-8 ${saldoInsuficiente ? "border-[#C21820] focus:ring-[#C21820]" : ""}`}
                      />
                    </div>
                    {saldoInsuficiente && (
                      <p className="mt-1.5 text-xs text-[#C21820]">{copy.insufficientBalance}</p>
                    )}
                  </div>

                  {/* Observação */}
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">{copy.fields.note}</label>
                    <input
                      value={observacao}
                      onChange={(e) => setObservacao(e.target.value)}
                      placeholder={copy.fields.notePlaceholder}
                      className={inputClass}
                    />
                  </div>
                </div>

                {/* Footer */}
                <div className="flex shrink-0 flex-col-reverse gap-3 border-t border-border px-4 py-4 sm:flex-row sm:px-6">
                  <button
                    type="button"
                    onClick={fechar}
                    className="flex-1 h-11 rounded-[0.75rem] border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors"
                  >
                    {copy.cancel}
                  </button>
                  <motion.button
                    whileHover={qtdValida && !saldoInsuficiente ? { scale: 1.02 } : undefined}
                    whileTap={qtdValida && !saldoInsuficiente ? { scale: 0.97 } : undefined}
                    type="submit"
                    disabled={pending || !qtdValida || saldoInsuficiente}
                    className="flex-1 h-11 flex items-center justify-center gap-2 rounded-[0.75rem] text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: "var(--gradient-signature)" }}
                  >
                    <Check size={15} />
                    {pending ? copy.submitting : copy.submit}
                  </motion.button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
