"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { actionListarFunil, actionMoverOportunidade } from "./actions";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";

type Etapa = { id: string; nome: string; ordem: number; cor: string | null };
type Oportunidade = { id: string; titulo: string; etapaId: string; brandId: string; valor: string | null };

const BRAND_KARZI = process.env.NEXT_PUBLIC_BRAND_ID_KARZI ?? "";
const BRAND_WUWU = process.env.NEXT_PUBLIC_BRAND_ID_WUWU ?? "";

function brandLabel(brandId: string) {
  if (brandId === BRAND_KARZI) return { label: "KARZI", color: "var(--karzi)" };
  if (brandId === BRAND_WUWU) return { label: "WUWU", color: "var(--wuwu)" };
  return { label: "—", color: "var(--muted-foreground)" };
}


export function VendasFunil() {
  const router = useRouter();
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [oportunidades, setOportunidades] = useState<Oportunidade[]>([]);
  const [loading, setLoading] = useState(true);
  const [, startTransition] = useTransition();

  const carregar = useCallback(() => {
    startTransition(async () => {
      setLoading(true);
      try {
        const res = await actionListarFunil();
        setEtapas(res.etapas as Etapa[]);
        setOportunidades(res.oportunidades as Oportunidade[]);
      } catch {
        toast.error("Erro ao carregar funil.");
      } finally {
        setLoading(false);
      }
    });
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function mover(opId: string, novaEtapaId: string) {
    try {
      await actionMoverOportunidade(opId, novaEtapaId);
      setOportunidades((prev) => prev.map((o) => o.id === opId ? { ...o, etapaId: novaEtapaId } : o));
    } catch {
      toast.error("Erro ao mover oportunidade.");
    }
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Vendas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Funil, pedidos, tarefas e agenda comercial</p>
        </div>
        <button
          onClick={() => router.push("/vendas/nova")}
          className="h-10 px-4 rounded-[0.75rem] text-sm font-semibold text-white"
          style={{ background: "var(--gradient-signature)" }}
        >
          + Nova oportunidade
        </button>
      </div>

      {loading ? (
        <div className="text-center text-sm text-muted-foreground py-12">Carregando funil…</div>
      ) : etapas.length === 0 ? (
        <div className="rounded-[1.25rem] border border-border bg-card">
          <EmptyState
            illustration="funnel"
            title="Funil vazio"
            description="Configure as etapas do funil e comece a registrar oportunidades."
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
                className="flex-shrink-0 w-64 rounded-[1.25rem] border border-border bg-card"
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
                    <p className="text-xs text-muted-foreground text-center py-4">Arraste oportunidades aqui</p>
                  ) : (
                    ops.map((op) => {
                      const brand = brandLabel(op.brandId);
                      return (
                        <div
                          key={op.id}
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData("opId", op.id)}
                          className="rounded-[0.75rem] border border-border bg-background p-3 cursor-grab hover:shadow-[0_4px_20px_rgba(14,15,19,.08)] transition-shadow"
                        >
                          <p className="text-sm font-medium text-foreground leading-tight">{op.titulo}</p>
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
                        </div>
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
