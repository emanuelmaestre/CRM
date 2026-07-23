"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import pagesConfig from "@/config/pages.json";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import {
  actionAtualizarStatusTarefa,
  actionCriarTarefa,
  actionListarReferenciasTarefa,
  actionListarTarefas,
} from "./actions";

const copy = pagesConfig.tarefas;
type TarefaItem = Awaited<ReturnType<typeof actionListarTarefas>>["data"][number];
type Referencia = { id: string; nome: string };

function formatarData(value: Date | string | null) {
  if (!value) return copy.labels.noDueDate;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function atrasada(item: TarefaItem) {
  return Boolean(item.vencimentoEm && new Date(item.vencimentoEm) < new Date()
    && item.status !== "concluida" && item.status !== "cancelada");
}

export function TarefasLista() {
  const [tarefas, setTarefas] = useState<TarefaItem[]>([]);
  const [clientes, setClientes] = useState<Referencia[]>([]);
  const [responsaveis, setResponsaveis] = useState<Referencia[]>([]);
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("");
  const [responsavelId, setResponsavelId] = useState("");
  const [canViewTeam, setCanViewTeam] = useState(false);
  const [formAberto, setFormAberto] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const requestId = useRef(0);

  const carregar = useCallback((termo = "", filtroStatus = "", responsavel = "") => {
    const currentRequest = ++requestId.current;
    startTransition(async () => {
      setLoading(true);
      try {
        const result = await actionListarTarefas({ busca: termo, status: filtroStatus as never, responsavelId: responsavel });
        if (currentRequest !== requestId.current) return;
        setTarefas(result.data);
        setCanViewTeam(result.permissions.canViewTeam);
      } catch {
        if (currentRequest === requestId.current) toast.error(copy.messages.loadError);
      } finally {
        if (currentRequest === requestId.current) setLoading(false);
      }
    });
  }, []);

  useEffect(() => {
    actionListarReferenciasTarefa().then((result) => {
      setClientes(result.clientes);
      setResponsaveis(result.responsaveis);
    }).catch(() => toast.error(copy.messages.loadError));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => carregar(busca, status, responsavelId), busca ? 300 : 0);
    return () => clearTimeout(timer);
  }, [busca, status, responsavelId, carregar]);

  function criar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const vencimento = String(formData.get("vencimentoEm") ?? "");
    if (vencimento) formData.set("vencimentoEm", new Date(vencimento).toISOString());
    startTransition(async () => {
      try {
        await actionCriarTarefa(formData);
        form.reset();
        setFormAberto(false);
        toast.success(copy.messages.createSuccess);
        carregar(busca, status, responsavelId);
      } catch {
        toast.error(copy.messages.createError);
      }
    });
  }

  function alterarStatus(id: string, novoStatus: string) {
    startTransition(async () => {
      try {
        await actionAtualizarStatusTarefa(id, novoStatus);
        setTarefas((atuais) => atuais.map((item) => item.id === id ? { ...item, status: novoStatus as TarefaItem["status"] } : item));
        toast.success(copy.messages.statusSuccess);
      } catch {
        toast.error(copy.messages.statusError);
      }
    });
  }

  return (
    <div data-testid="tarefas-page">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h1 className="text-2xl font-bold text-foreground">{copy.title}</h1><p className="mt-1 text-sm text-muted-foreground">{copy.description}</p></div>
        <button type="button" onClick={() => setFormAberto((value) => !value)} className="min-h-11 rounded-xl px-4 text-sm font-semibold text-white" style={{ background: "var(--gradient-signature)" }}>{copy.newAction}</button>
      </header>

      {formAberto && (
        <form onSubmit={criar} className="mb-5 grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2" data-testid="tarefa-form">
          <label className="text-sm font-medium sm:col-span-2">{copy.fields.title}<input required name="titulo" maxLength={160} className="mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3" /></label>
          <label className="text-sm font-medium sm:col-span-2">{copy.fields.description}<textarea name="descricao" maxLength={2000} rows={3} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2" /></label>
          <label className="text-sm font-medium">{copy.fields.client}<select name="clienteId" className="mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3"><option value="">{copy.fields.optional}</option>{clientes.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
          <label className="text-sm font-medium">{copy.fields.owner}<select name="responsavelId" className="mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3"><option value="">{copy.fields.optional}</option>{responsaveis.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
          <label className="text-sm font-medium">{copy.fields.dueAt}<input name="vencimentoEm" type="datetime-local" className="mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3" /></label>
          <div className="flex items-end justify-end gap-2 sm:col-span-2"><button type="button" onClick={() => setFormAberto(false)} className="min-h-11 rounded-xl px-4 text-sm">{copy.actions.cancel}</button><button disabled={pending} className="min-h-11 rounded-xl bg-foreground px-5 text-sm font-semibold text-background disabled:opacity-50">{pending ? copy.actions.saving : copy.actions.save}</button></div>
        </form>
      )}

      <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_190px_220px]">
        <input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder={copy.searchPlaceholder} className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm" />
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm"><option value="">{copy.allStatuses}</option>{Object.entries(copy.status).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        {canViewTeam && <select value={responsavelId} onChange={(event) => setResponsavelId(event.target.value)} className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm"><option value="">{copy.allOwners}</option>{responsaveis.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select>}
      </div>

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        {loading ? <p className="p-10 text-center text-sm text-muted-foreground">{copy.loading}</p> : tarefas.length === 0 ? <EmptyState illustration="generic" title={copy.empty.title} description={copy.empty.description} /> : <>
          <div className="divide-y divide-border md:hidden">{tarefas.map((item) => <article key={item.id} className="space-y-3 p-4" data-testid={`tarefa-${item.id}`}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{item.titulo}</p><p className="mt-1 text-xs text-muted-foreground">{item.clienteNome ?? copy.labels.noClient} · {item.responsavelNome ?? "—"}</p></div>{atrasada(item) && <span className="rounded-full bg-destructive/10 px-2 py-1 text-xs font-semibold text-destructive">{copy.labels.overdue}</span>}</div>{item.descricao && <p className="text-sm text-muted-foreground">{item.descricao}</p>}<p className="text-xs text-muted-foreground">{formatarData(item.vencimentoEm)}</p><select aria-label={copy.labels.statusAria.replace("{title}", item.titulo)} data-testid={`status-tarefa-${item.id}`} value={item.status} onChange={(event) => alterarStatus(item.id, event.target.value)} className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm">{Object.entries(copy.status).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></article>)}</div>
          <div className="hidden overflow-x-auto md:block"><table className="w-full text-sm"><thead><tr className="border-b border-border text-left text-muted-foreground"><th className="px-5 py-3">{copy.fields.title}</th><th className="px-5 py-3">{copy.fields.client}</th><th className="px-5 py-3">{copy.fields.owner}</th><th className="px-5 py-3">{copy.fields.dueAt}</th><th className="px-5 py-3">{copy.labels.status}</th></tr></thead><tbody>{tarefas.map((item) => <tr key={item.id} className="border-b border-border last:border-0" data-testid={`tarefa-${item.id}`}><td className="px-5 py-3"><p className="font-medium">{item.titulo}</p>{item.descricao && <p className="mt-1 max-w-sm truncate text-xs text-muted-foreground">{item.descricao}</p>}</td><td className="px-5 py-3 text-muted-foreground">{item.clienteNome ?? copy.labels.noClient}</td><td className="px-5 py-3 text-muted-foreground">{item.responsavelNome ?? "—"}</td><td className="px-5 py-3"><span className={atrasada(item) ? "font-semibold text-destructive" : "text-muted-foreground"}>{formatarData(item.vencimentoEm)}</span></td><td className="px-5 py-3"><select aria-label={copy.labels.statusAria.replace("{title}", item.titulo)} data-testid={`status-tarefa-${item.id}`} value={item.status} onChange={(event) => alterarStatus(item.id, event.target.value)} className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm">{Object.entries(copy.status).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td></tr>)}</tbody></table></div>
        </>}
      </section>
    </div>
  );
}
