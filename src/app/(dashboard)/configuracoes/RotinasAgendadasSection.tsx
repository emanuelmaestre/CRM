"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Activity, AlertTriangle, CalendarClock, CheckCircle2, Clock3, Loader2, MinusCircle, XCircle } from "lucide-react";
import { tint } from "@/shared/design-system/color";
import { springs, stagger, variantes } from "@/shared/design-system/motion-variants";
import { Skeleton } from "@/shared/design-system/primitives/Skeleton";
import type { actionListarRotinasAgendadas } from "./actions";

type RotinasAgendadasData = Awaited<ReturnType<typeof actionListarRotinasAgendadas>>;
type Rotina = RotinasAgendadasData["itens"][number];

const dataHora = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

const statusConfig = {
  ok: { label: "No prazo", color: "var(--success)", icon: CheckCircle2 },
  atrasado: { label: "Atrasada", color: "var(--warning)", icon: AlertTriangle },
  falhou: { label: "Falhou", color: "var(--destructive)", icon: XCircle },
  rodando: { label: "Rodando", color: "var(--acento-2)", icon: Loader2 },
  sem_registro: { label: "Sem registro", color: "var(--muted-foreground)", icon: MinusCircle },
} as const;

const categoriaCor: Record<string, string> = {
  Pedidos: "var(--info)",
  Canais: "var(--acento-2)",
  "Pós-venda": "var(--acento-1)",
  Estoque: "var(--success)",
  Atendimento: "var(--primary)",
  IA: "var(--acento-3)",
  CRM: "var(--foreground)",
  Operação: "var(--warning)",
  Anúncios: "var(--acento-2)",
  Relacionamento: "var(--acento-1)",
  Segurança: "var(--destructive)",
};

function formatarData(value: string | null) {
  if (!value) return "—";
  return dataHora.format(new Date(value));
}

function StatusPill({ status }: { status: Rotina["status"] }) {
  const config = statusConfig[status];
  const Icon = config.icon;
  return (
    <span
      className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-bold"
      style={{ background: tint(config.color, status === "sem_registro" ? 10 : 12), color: config.color }}
    >
      <Icon size={12} strokeWidth={2.4} className={status === "rodando" ? "animate-spin" : undefined} />
      {config.label}
    </span>
  );
}

function ResumoChip({ label, value, color, subtle = false }: { label: string; value: number; color: string; subtle?: boolean }) {
  return (
    <span
      className="inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-bold"
      style={{ background: subtle ? "var(--muted)" : tint(color, 10), color }}
    >
      <span className="tabular-nums">{value}</span>
      {label}
    </span>
  );
}

function RotinaSkeleton() {
  return (
    <div className="space-y-2 rounded-[0.9rem] border border-border bg-background/55 p-3">
      <Skeleton className="h-3 w-44" />
      <Skeleton className="h-3 w-28" />
      <Skeleton className="h-7 w-full" />
    </div>
  );
}

function LinhaRotina({ item, indice }: { item: Rotina; indice: number }) {
  const reduzir = useReducedMotion();
  const corCategoria = categoriaCor[item.categoria] ?? "var(--muted-foreground)";
  const semRegistro = item.status === "sem_registro";
  return (
    <motion.article
      variants={variantes(reduzir, { hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0, transition: { ...springs.settleFast, delay: indice * 0.015 } } })}
      className="group grid gap-3 rounded-[0.9rem] border border-transparent bg-background/50 px-3 py-3 transition-colors hover:border-border hover:bg-background sm:grid-cols-[minmax(12rem,1.2fr)_minmax(8rem,.72fr)_minmax(10rem,.9fr)_auto] sm:items-center"
    >
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-semibold text-foreground">{item.titulo}</p>
          <span
            className="inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[10px] font-bold"
            style={{ background: tint(corCategoria, 10), color: corCategoria }}
          >
            {item.categoria}
          </span>
        </div>
        <p className="mt-1 truncate font-mono text-[10.5px] text-muted-foreground">{item.nome}</p>
      </div>

      <div className="flex min-w-0 items-start gap-2">
        <CalendarClock size={13} className="mt-0.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-foreground">{item.agenda}</p>
          <code className="mt-1 inline-flex rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{item.cron}</code>
        </div>
      </div>

      <div className="flex min-w-0 items-start gap-2">
        <Clock3 size={13} className="mt-0.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className={`truncate text-xs font-semibold ${semRegistro ? "text-muted-foreground" : "text-foreground"}`}>
            {item.ultimaExecucaoEm ? formatarData(item.ultimaExecucaoEm) : "Ainda sem execução"}
          </p>
          {item.finalizadoEm && (
            <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground">Finalizou {formatarData(item.finalizadoEm)}</p>
          )}
        {item.erro && <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-destructive">{item.erro}</p>}
        </div>
      </div>

      <StatusPill status={item.status} />
    </motion.article>
  );
}

export function RotinasAgendadasSection({ data, loading }: { data: RotinasAgendadasData | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-11 w-full" />
        {Array.from({ length: 4 }).map((_, index) => <RotinaSkeleton key={index} />)}
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-muted-foreground">Não foi possível carregar as rotinas agendadas.</p>;
  }

  const saudaveis = data.ok + data.rodando;
  const comAtencao = data.falhas + data.atrasadas;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-[0.9rem] border border-border bg-background/55 px-3 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
            style={{ background: tint(comAtencao > 0 ? "var(--warning)" : "var(--success)", 10), color: comAtencao > 0 ? "var(--warning)" : "var(--success)" }}
          >
            {comAtencao > 0 ? <AlertTriangle size={15} /> : <Activity size={15} />}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-foreground">
              {comAtencao > 0 ? `${comAtencao} rotina${comAtencao === 1 ? "" : "s"} pedem atenção` : "Rotinas sob controle"}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {saudaveis} de {data.total} com execução recente{data.semRegistro > 0 ? ` · ${data.semRegistro} aguardando primeiro registro` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <ResumoChip label="no prazo" value={data.ok} color="var(--success)" />
          {data.rodando > 0 && <ResumoChip label="rodando" value={data.rodando} color="var(--acento-2)" />}
          {data.falhas > 0 && <ResumoChip label="falhas" value={data.falhas} color="var(--destructive)" />}
          {data.atrasadas > 0 && <ResumoChip label="atrasadas" value={data.atrasadas} color="var(--warning)" />}
          {data.semRegistro > 0 && <ResumoChip label="sem registro" value={data.semRegistro} color="var(--muted-foreground)" subtle />}
          <span className="inline-flex min-h-7 items-center gap-1.5 pl-1 text-[11px] font-medium text-muted-foreground">
            <Clock3 size={12} />
            {formatarData(data.atualizadoEm)}
          </span>
        </div>
      </div>

      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="space-y-1.5"
      >
        {data.itens.map((item, indice) => <LinhaRotina key={item.nome} item={item} indice={indice} />)}
      </motion.div>
    </div>
  );
}
