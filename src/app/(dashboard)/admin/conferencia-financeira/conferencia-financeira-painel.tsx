"use client";

import { useState } from "react";
import { AlertTriangle, Clock, CheckCircle2, ChevronDown, ScrollText } from "lucide-react";
import { motion } from "framer-motion";
import { PageHeader } from "@/shared/design-system/primitives/PageHeader";
import { StatCard } from "@/shared/design-system/primitives/StatCard";
import { SectionCard } from "@/shared/design-system/primitives/SectionCard";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { fadeUp, stagger } from "@/shared/design-system/motion-variants";
import type { listarConferenciasAbertas } from "@/modules/vendas/application/conferencia-financeira.service";

type Data = Awaited<ReturnType<typeof listarConferenciasAbertas>>;

const CANAL_ROTULO: Record<string, string> = {
  mercadolivre: "Mercado Livre",
  shopee: "Shopee",
  tiktokshop: "TikTok Shop",
};

const CLASSIFICACAO_ROTULO: Record<string, string> = {
  divergente_bruto: "Soma ≠ bruto",
  sem_repasse: "Repasse ausente",
  aguardando_repasse: "Repasse não liberado",
  residuo_liquido_atipico: "Repasse atípico",
};

const STATUS_ROTULO: Record<string, string> = {
  detectado: "detectado (sem re-busca)",
  persistente: "persistente",
  aguardando: "aguardando repasse",
};

function moeda(valor: number | string): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(valor));
}

function dataHora(valor: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(valor));
}

export function ConferenciaFinanceiraPainel({ data }: { data: Data }) {
  const [aberto, setAberto] = useState<string | null>(null);

  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      <PageHeader
        title="Conferência financeira"
        description="A somatória dos elementos contra o valor bruto de cada canal. Detectadas na hora em que o pedido entra; as que não fecham nem depois de re-buscar na API viram persistentes."
      />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <motion.div variants={fadeUp}>
          <StatCard label="Detectadas na ingestão" value={data.totais.detectados} sub="Achadas na entrada, sem re-busca ainda" icon={ScrollText} />
        </motion.div>
        <motion.div variants={fadeUp}>
          <StatCard label="Persistentes" value={data.totais.persistentes} sub="Não fecharam nem após re-busca" icon={AlertTriangle} />
        </motion.div>
        <motion.div variants={fadeUp}>
          <StatCard label="Repasse não liberado" value={data.totais.aguardando} sub="Shopee, dentro da carência" icon={Clock} />
        </motion.div>
        <motion.div variants={fadeUp}>
          <StatCard label="Resolvidas (30 dias)" value={data.totais.resolvidas30d} sub="Corrigidas pela API do canal" icon={CheckCircle2} />
        </motion.div>
      </div>

      <div className="mt-5">
        <motion.div variants={fadeUp}>
          <SectionCard title="Pedidos em aberto" description="Ordenados pela verificação mais recente. Abra uma linha para ver o log da decomposição.">
            {data.itens.length === 0 ? (
              <EmptyState illustration="reports" title="Nenhuma divergência em aberto." className="py-6" />
            ) : (
              <div className="-mx-6 -my-6 divide-y divide-border">
                {data.itens.map((item) => {
                  const expandido = aberto === item.id;
                  const residuo = item.residuoBrutoCentavos / 100;
                  return (
                    <div key={item.id}>
                      <button
                        type="button"
                        onClick={() => setAberto(expandido ? null : item.id)}
                        aria-expanded={expandido}
                        className="press-feedback flex w-full items-center justify-between gap-3 px-6 py-3.5 text-left"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {CANAL_ROTULO[item.canal] ?? item.canal} · {item.providerOrderId ?? "sem número"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            <span className={item.status === "persistente" ? "font-semibold text-destructive" : ""}>
                              {STATUS_ROTULO[item.status] ?? item.status}
                            </span>
                            {" · "}{CLASSIFICACAO_ROTULO[item.classificacao] ?? item.classificacao}
                            {" · "}bruto {moeda(item.brutoInformado)} · soma {moeda(item.somaComponentes)}
                            {item.tentativasRebusca > 0 && ` · ${item.tentativasRebusca} re-busca(s)`}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <span className={`text-sm font-bold tabular-nums ${item.status === "persistente" ? "text-destructive" : "text-muted-foreground"}`}>
                            {residuo > 0 ? "+" : ""}{moeda(residuo)}
                          </span>
                          <ChevronDown size={16} className={`text-muted-foreground transition-transform ${expandido ? "rotate-180" : ""}`} />
                        </div>
                      </button>
                      {expandido && (
                        <div className="bg-muted/40 px-6 py-4">
                          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                            <ScrollText size={13} /> Log · primeira detecção {dataHora(item.primeiraDeteccaoEm)} · última verificação {dataHora(item.ultimaVerificacaoEm)}
                          </p>
                          <pre className="max-h-96 overflow-auto rounded-lg bg-card p-3 text-[11px] leading-relaxed text-foreground">
                            {JSON.stringify(item.componentes, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </motion.div>
      </div>
    </motion.div>
  );
}
