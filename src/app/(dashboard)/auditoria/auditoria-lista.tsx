"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import pagesConfig from "@/config/pages.json";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { actionListarAuditoria } from "./actions";

const copy = pagesConfig.auditoria;
type AuditItem = Awaited<ReturnType<typeof actionListarAuditoria>>["data"][number];

function formatarData(value: Date | string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short", timeStyle: "medium", timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function Detalhes({ item }: { item: AuditItem }) {
  if (!item.antes && !item.depois) return <span className="text-muted-foreground">—</span>;
  return (
    <details className="max-w-xl text-xs">
      <summary className="min-h-11 cursor-pointer py-3 font-medium text-primary">{copy.labels.details}</summary>
      <div className="space-y-3 pb-3">
        {item.antes != null && <div><p className="mb-1 font-semibold text-muted-foreground">{copy.labels.before}</p><pre className="max-h-64 overflow-auto rounded-lg bg-muted p-3 whitespace-pre-wrap break-all">{JSON.stringify(item.antes, null, 2)}</pre></div>}
        {item.depois != null && <div><p className="mb-1 font-semibold text-muted-foreground">{copy.labels.after}</p><pre className="max-h-64 overflow-auto rounded-lg bg-muted p-3 whitespace-pre-wrap break-all">{JSON.stringify(item.depois, null, 2)}</pre></div>}
      </div>
    </details>
  );
}

export function AuditoriaLista() {
  const [items, setItems] = useState<AuditItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [busca, setBusca] = useState("");
  const [entidade, setEntidade] = useState("");
  const [autorTipo, setAutorTipo] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [loading, setLoading] = useState(true);
  const [, startTransition] = useTransition();
  const requestId = useRef(0);
  const limite = 50;

  const carregar = useCallback(() => {
    const currentRequest = ++requestId.current;
    startTransition(async () => {
      setLoading(true);
      try {
        const result = await actionListarAuditoria({
          busca, entidade, autorTipo, pagina, limite,
          inicio: inicio ? new Date(`${inicio}T00:00:00-03:00`).toISOString() : undefined,
          fim: fim ? new Date(`${fim}T23:59:59.999-03:00`).toISOString() : undefined,
        });
        if (currentRequest !== requestId.current) return;
        setItems(result.data);
        setTotal(result.total);
      } catch {
        if (currentRequest === requestId.current) toast.error(copy.messages.loadError);
      } finally {
        if (currentRequest === requestId.current) setLoading(false);
      }
    });
  }, [autorTipo, busca, entidade, fim, inicio, pagina]);

  useEffect(() => {
    const timer = setTimeout(carregar, busca ? 300 : 0);
    return () => clearTimeout(timer);
  }, [carregar, busca]);

  const totalPaginas = Math.max(1, Math.ceil(total / limite));

  return (
    <div data-testid="auditoria-page">
      <header className="mb-6"><h1 className="text-2xl font-bold text-foreground">{copy.title}</h1><p className="mt-1 text-sm text-muted-foreground">{copy.description}</p></header>
      <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_160px_150px_150px]">
        <input value={busca} onChange={(event) => { setBusca(event.target.value); setPagina(1); }} placeholder={copy.searchPlaceholder} className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm" />
        <select value={entidade} onChange={(event) => { setEntidade(event.target.value); setPagina(1); }} className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm"><option value="">{copy.allEntities}</option>{copy.entities.map((value) => <option key={value} value={value}>{value}</option>)}</select>
        <select value={autorTipo} onChange={(event) => { setAutorTipo(event.target.value); setPagina(1); }} className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm"><option value="">{copy.allOrigins}</option>{Object.entries(copy.origins).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <input aria-label="Data inicial" value={inicio} onChange={(event) => { setInicio(event.target.value); setPagina(1); }} type="date" className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm" />
        <input aria-label="Data final" value={fim} onChange={(event) => { setFim(event.target.value); setPagina(1); }} type="date" className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm" />
      </div>

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        {loading ? <p className="p-10 text-center text-sm text-muted-foreground">{copy.loading}</p> : items.length === 0 ? <EmptyState illustration="generic" title={copy.empty.title} description={copy.empty.description} /> : <>
          <div className="divide-y divide-border lg:hidden">{items.map((item) => <article key={item.id} className="space-y-2 p-4" data-testid={`audit-${item.id}`}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{item.entidade} · {item.acao}</p><p className="mt-1 font-mono text-[11px] text-muted-foreground">{item.entidadeId}</p></div><span className="text-xs text-muted-foreground">{formatarData(item.createdAt)}</span></div><p className="text-sm text-muted-foreground">{item.autorNome ?? copy.labels.system} · {copy.origins[item.autorTipo as keyof typeof copy.origins] ?? item.autorTipo}</p><Detalhes item={item} /></article>)}</div>
          <div className="hidden overflow-x-auto lg:block"><table className="w-full text-sm"><thead><tr className="border-b border-border text-left text-muted-foreground">{copy.columns.map((column) => <th key={column} className="px-4 py-3 font-medium">{column}</th>)}</tr></thead><tbody>{items.map((item) => <tr key={item.id} className="border-b border-border align-top last:border-0" data-testid={`audit-${item.id}`}><td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">{formatarData(item.createdAt)}</td><td className="px-4 py-3"><p className="font-medium">{item.autorNome ?? copy.labels.system}</p><p className="text-xs text-muted-foreground">{copy.origins[item.autorTipo as keyof typeof copy.origins] ?? item.autorTipo}</p></td><td className="px-4 py-3"><p className="font-medium">{item.entidade}</p><p className="max-w-36 truncate font-mono text-[10px] text-muted-foreground">{item.entidadeId}</p></td><td className="px-4 py-3 font-medium">{item.acao}</td><td className="px-4 py-3 text-muted-foreground">{item.brandNome ?? "—"}</td><td className="px-4 py-1"><Detalhes item={item} /></td></tr>)}</tbody></table></div>
        </>}
      </section>
      <div className="mt-4 flex items-center justify-between gap-3"><button type="button" disabled={pagina <= 1} onClick={() => setPagina((value) => value - 1)} className="min-h-11 rounded-xl border border-border px-4 text-sm disabled:opacity-40">{copy.actions.previous}</button><p className="text-sm text-muted-foreground">{copy.labels.page.replace("{current}", String(pagina)).replace("{total}", String(totalPaginas))}</p><button type="button" disabled={pagina >= totalPaginas} onClick={() => setPagina((value) => value + 1)} className="min-h-11 rounded-xl border border-border px-4 text-sm disabled:opacity-40">{copy.actions.next}</button></div>
    </div>
  );
}
