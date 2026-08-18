"use client";

import { AlertTriangle, CheckCircle2, Clock3, Loader2, MinusCircle, XCircle } from "lucide-react";
import { tint } from "@/shared/design-system/color";
import { SkeletonRow } from "@/shared/design-system/primitives/Skeleton";
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

function ResumoChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span
      className="inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-[11px] font-bold"
      style={{ background: tint(color, 10), color }}
    >
      <span className="tabular-nums">{value}</span>
      {label}
    </span>
  );
}

function LinhaRotina({ item }: { item: Rotina }) {
  const corCategoria = categoriaCor[item.categoria] ?? "var(--muted-foreground)";
  return (
    <article className="grid gap-3 px-3 py-3 sm:grid-cols-[minmax(12rem,1.25fr)_minmax(8rem,.8fr)_minmax(11rem,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-foreground">{item.titulo}</p>
          <span
            className="inline-flex h-6 items-center rounded-full px-2 text-[10px] font-bold"
            style={{ background: tint(corCategoria, 10), color: corCategoria }}
          >
            {item.categoria}
          </span>
        </div>
        <p className="mt-0.5 truncate text-[11px] font-medium text-muted-foreground">{item.nome}</p>
      </div>

      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.07em] text-muted-foreground">Agenda</p>
        <p className="mt-0.5 text-xs font-semibold text-foreground">{item.agenda}</p>
        <code className="mt-1 inline-flex rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{item.cron}</code>
      </div>

      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.07em] text-muted-foreground">Última execução</p>
        <p className="mt-0.5 text-xs font-semibold text-foreground">{formatarData(item.ultimaExecucaoEm)}</p>
        {item.erro && <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-destructive">{item.erro}</p>}
      </div>

      <StatusPill status={item.status} />
    </article>
  );
}

export function RotinasAgendadasSection({ data, loading }: { data: RotinasAgendadasData | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="overflow-hidden rounded-[0.9rem] border border-border bg-background/60">
        {Array.from({ length: 5 }).map((_, index) => <SkeletonRow key={index} />)}
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-muted-foreground">Não foi possível carregar as rotinas agendadas.</p>;
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <ResumoChip label="rotinas" value={data.total} color="var(--foreground)" />
        <ResumoChip label="no prazo" value={data.ok} color="var(--success)" />
        <ResumoChip label="falhas" value={data.falhas} color="var(--destructive)" />
        <ResumoChip label="sem registro" value={data.semRegistro} color="var(--muted-foreground)" />
        {data.atrasadas > 0 && <ResumoChip label="atrasadas" value={data.atrasadas} color="var(--warning)" />}
        {data.rodando > 0 && <ResumoChip label="rodando" value={data.rodando} color="var(--acento-2)" />}
        <span className="ml-auto inline-flex min-h-8 items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <Clock3 size={12} />
          {formatarData(data.atualizadoEm)}
        </span>
      </div>

      <div className="overflow-hidden rounded-[0.9rem] border border-border bg-background/60">
        <div className="hidden grid-cols-[minmax(12rem,1.25fr)_minmax(8rem,.8fr)_minmax(11rem,1fr)_auto] gap-3 border-b border-border bg-muted/35 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.07em] text-muted-foreground sm:grid">
          <span>Rotina</span>
          <span>Agenda</span>
          <span>Última execução</span>
          <span>Status</span>
        </div>
        <div className="divide-y divide-border">
          {data.itens.map((item) => <LinhaRotina key={item.nome} item={item} />)}
        </div>
      </div>
    </div>
  );
}
