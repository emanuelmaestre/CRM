"use client";

import { DollarSign, Cpu, CheckCircle2, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/shared/design-system/primitives/PageHeader";
import { StatCard } from "@/shared/design-system/primitives/StatCard";
import { SectionCard } from "@/shared/design-system/primitives/SectionCard";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { fadeUp, stagger } from "@/shared/design-system/motion-variants";
import { motion } from "framer-motion";
import type { obterConsumoDetalhado } from "@/modules/ai/application/ai.service";

type ConsumoData = Awaited<ReturnType<typeof obterConsumoDetalhado>>;

function moeda(valor: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" }).format(valor);
}

function dataHora(valor: Date | string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(valor));
}

export function ConsumoIaPainel({ data }: { data: ConsumoData }) {
  const cortado = data.percentual >= 100;

  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      <PageHeader
        title="Consumo de IA"
        description="Custo, runs e corte suave de orçamento mensal — nenhuma geração roda além do limite configurado."
      />

      {cortado && (
        <motion.div
          variants={fadeUp}
          className="mb-5 flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          <AlertTriangle size={16} strokeWidth={1.75} className="shrink-0" />
          Orçamento mensal atingido — novas gerações de IA estão bloqueadas até o próximo ciclo (corte suave).
        </motion.div>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <motion.div variants={fadeUp}>
          <StatCard
            label="Consumo do mês"
            value={moeda(data.consumoAtualUsd)}
            sub={`Orçamento: ${moeda(data.orcamentoUsd)}`}
            icon={DollarSign}
          />
        </motion.div>
        <motion.div variants={fadeUp}>
          <StatCard
            label="Uso do orçamento"
            value={`${data.percentual}%`}
            sub={data.alerta ? `Alerta em ${data.alerta}` : "Dentro do limite"}
            icon={AlertTriangle}
          />
        </motion.div>
        <motion.div variants={fadeUp}>
          <StatCard label="Runs no mês" value={data.totalRuns} sub="Chamadas estruturadas à OpenAI" icon={Cpu} />
        </motion.div>
        <motion.div variants={fadeUp}>
          <StatCard label="Taxa de sucesso" value={`${data.taxaSucesso}%`} sub="Sem reparo ou com 1 tentativa" icon={CheckCircle2} />
        </motion.div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <motion.div variants={fadeUp}>
          <SectionCard title="Custo por finalidade" description="Mês corrente, agrupado por tipo de geração">
            {data.porFinalidade.length === 0 ? (
              <EmptyState illustration="reports" title="Sem consumo de IA no período." className="py-6" />
            ) : (
              <div className="-mx-6 -my-6 divide-y divide-border">
                {data.porFinalidade.map((item) => (
                  <div key={item.finalidade} className="flex items-center justify-between gap-3 px-6 py-3.5">
                    <div>
                      <p className="text-sm font-semibold text-foreground capitalize">{item.finalidade.replaceAll("_", " ")}</p>
                      <p className="text-xs text-muted-foreground">{item.runs} run{item.runs === 1 ? "" : "s"}</p>
                    </div>
                    <span className="text-sm font-bold tabular-nums text-foreground">{moeda(item.custoUsd)}</span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </motion.div>

        <motion.div variants={fadeUp}>
          <SectionCard title="Runs recentes" description="Últimas 30 chamadas registradas, qualquer período">
            {data.recentes.length === 0 ? (
              <EmptyState illustration="reports" title="Nenhuma chamada de IA registrada ainda." className="py-6" />
            ) : (
              <div className="-mx-6 -my-6 divide-y divide-border max-h-[420px] overflow-y-auto">
                {data.recentes.map((run) => (
                  <div key={run.id} className="flex items-center justify-between gap-3 px-6 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground capitalize truncate">{run.finalidade.replaceAll("_", " ")}</p>
                      <p className="text-xs text-muted-foreground">{run.modelo} · {dataHora(run.createdAt)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm tabular-nums text-foreground">{moeda(parseFloat(run.custoUsd ?? "0"))}</p>
                      <span className={`text-[10px] font-semibold ${run.sucesso === "true" ? "text-success" : "text-destructive"}`}>
                        {run.sucesso === "true" ? "sucesso" : "falha"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </motion.div>
      </div>
    </motion.div>
  );
}
