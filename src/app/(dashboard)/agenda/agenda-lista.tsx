"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import pagesConfig from "@/config/pages.json";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import {
  actionCriarEventoAgenda,
  actionExcluirEventoAgenda,
  actionListarAgenda,
  actionListarReferenciasAgenda,
} from "./actions";

const copy = pagesConfig.agenda;
type EventoItem = Awaited<ReturnType<typeof actionListarAgenda>>["data"][number];
type Referencia = { id: string; nome: string };

function formatarData(value: Date | string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium", timeStyle: "short", timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

export function AgendaLista() {
  const periodo = useMemo(() => {
    const inicio = new Date();
    inicio.setDate(inicio.getDate() - 30);
    const fim = new Date();
    fim.setDate(fim.getDate() + 180);
    return { inicio: inicio.toISOString(), fim: fim.toISOString() };
  }, []);
  const [eventos, setEventos] = useState<EventoItem[]>([]);
  const [clientes, setClientes] = useState<Referencia[]>([]);
  const [responsaveis, setResponsaveis] = useState<Referencia[]>([]);
  const [responsavelId, setResponsavelId] = useState("");
  const [canViewTeam, setCanViewTeam] = useState(false);
  const [formAberto, setFormAberto] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const requestId = useRef(0);

  const carregar = useCallback((responsavel = "") => {
    const currentRequest = ++requestId.current;
    startTransition(async () => {
      setLoading(true);
      try {
        const result = await actionListarAgenda(periodo.inicio, periodo.fim, responsavel);
        if (currentRequest !== requestId.current) return;
        setEventos(result.data);
        setCanViewTeam(result.permissions.canViewTeam);
      } catch {
        if (currentRequest === requestId.current) toast.error(copy.messages.loadError);
      } finally {
        if (currentRequest === requestId.current) setLoading(false);
      }
    });
  }, [periodo]);

  useEffect(() => {
    actionListarReferenciasAgenda().then((result) => {
      setClientes(result.clientes);
      setResponsaveis(result.responsaveis);
    }).catch(() => toast.error(copy.messages.loadError));
  }, []);
  useEffect(() => { carregar(responsavelId); }, [responsavelId, carregar]);

  function criar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    for (const field of ["inicio", "fim"]) {
      const value = String(formData.get(field) ?? "");
      if (value) formData.set(field, new Date(value).toISOString());
    }
    startTransition(async () => {
      try {
        await actionCriarEventoAgenda(formData);
        form.reset();
        setFormAberto(false);
        toast.success(copy.messages.createSuccess);
        carregar(responsavelId);
      } catch {
        toast.error(copy.messages.createError);
      }
    });
  }

  function excluir(item: EventoItem) {
    if (!confirm(copy.actions.deleteConfirm.replace("{title}", item.titulo))) return;
    startTransition(async () => {
      try {
        await actionExcluirEventoAgenda(item.id);
        setEventos((atuais) => atuais.filter((evento) => evento.id !== item.id));
        toast.success(copy.messages.deleteSuccess);
      } catch {
        toast.error(copy.messages.deleteError);
      }
    });
  }

  return (
    <div data-testid="agenda-page">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h1 className="text-2xl font-bold text-foreground">{copy.title}</h1><p className="mt-1 text-sm text-muted-foreground">{copy.description}</p></div>
        <button type="button" onClick={() => setFormAberto((value) => !value)} className="min-h-11 rounded-xl px-4 text-sm font-semibold text-white" style={{ background: "var(--gradient-signature)" }}>{copy.newAction}</button>
      </header>

      {formAberto && <form onSubmit={criar} className="mb-5 grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2" data-testid="agenda-form">
        <label className="text-sm font-medium sm:col-span-2">{copy.fields.title}<input required name="titulo" maxLength={160} className="mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3" /></label>
        <label className="text-sm font-medium">{copy.fields.client}<select name="clienteId" className="mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3"><option value="">{copy.fields.optional}</option>{clientes.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
        <label className="text-sm font-medium">{copy.fields.owner}<select name="responsavelId" className="mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3"><option value="">{copy.fields.optional}</option>{responsaveis.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
        <label className="text-sm font-medium">{copy.fields.start}<input required name="inicio" type="datetime-local" className="mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3" /></label>
        <label className="text-sm font-medium">{copy.fields.end}<input name="fim" type="datetime-local" className="mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3" /></label>
        <div className="flex items-end justify-end gap-2 sm:col-span-2"><button type="button" onClick={() => setFormAberto(false)} className="min-h-11 rounded-xl px-4 text-sm">{copy.actions.cancel}</button><button disabled={pending} className="min-h-11 rounded-xl bg-foreground px-5 text-sm font-semibold text-background disabled:opacity-50">{pending ? copy.actions.saving : copy.actions.save}</button></div>
      </form>}

      {canViewTeam && <div className="mb-4 flex justify-end"><select value={responsavelId} onChange={(event) => setResponsavelId(event.target.value)} className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm sm:w-64"><option value="">{copy.allOwners}</option>{responsaveis.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></div>}

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        {loading ? <p className="p-10 text-center text-sm text-muted-foreground">{copy.loading}</p> : eventos.length === 0 ? <EmptyState illustration="generic" title={copy.empty.title} description={copy.empty.description} /> : <div className="divide-y divide-border">{eventos.map((item) => <article key={item.id} className="grid gap-3 p-4 sm:grid-cols-[180px_minmax(0,1fr)_auto] sm:items-center sm:px-5" data-testid={`evento-${item.id}`}><div><p className="text-sm font-semibold text-foreground">{formatarData(item.inicio)}</p>{item.fim && <p className="mt-1 text-xs text-muted-foreground">{copy.labels.until} {formatarData(item.fim)}</p>}</div><div><p className="font-semibold">{item.titulo}</p><p className="mt-1 text-xs text-muted-foreground">{item.clienteNome ?? copy.labels.noClient} · {item.responsavelNome ?? "—"}</p></div><button type="button" onClick={() => excluir(item)} disabled={pending} className="min-h-11 rounded-xl px-3 text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50">{copy.actions.delete}</button></article>)}</div>}
      </section>
    </div>
  );
}
