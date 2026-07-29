"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Archive, Check, Download, Pencil, ShieldOff, X } from "lucide-react";
import {
  actionArquivarCliente,
  actionAtualizarCliente,
  actionCriarAnotacao,
  actionExportarDadosCliente,
  actionRevogarConsentimento,
} from "../actions";
import pagesConfig from "@/config/pages.json";

const copy = pagesConfig.clientes.detail;

type ClienteData = {
  cliente: Record<string, unknown> & {
    id: string; nome: string; email?: string | null; telefone?: string | null; cpfCnpj?: string | null;
  };
  interacoes: Array<{ id: string; tipo: string; resumo: string | null; canal: string | null; createdAt: Date | string }>;
  anotacoes: Array<{ id: string; resumo: string | null; createdAt: Date | string }>;
  pedidos: Array<{ id: string; canal: string; status: string; total: string; createdAt: Date | string }>;
  tarefas: Array<{ id: string; titulo: string; status: string; vencimentoEm: Date | string | null }>;
  consentimentos: Array<{ id: string; finalidade: string; canal: string; status: string }>;
  tags: Array<{ id: string; nome: string; cor: string | null }>;
};

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export function Cliente360({
  initialData,
  canArchive,
  canManageLgpd,
}: {
  initialData: ClienteData;
  canArchive: boolean;
  canManageLgpd: boolean;
}) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const cliente = data.cliente;

  function submit(formData: FormData) {
    startTransition(async () => {
      try {
        const atualizado = await actionAtualizarCliente(cliente.id, formData);
        setData((current) => ({ ...current, cliente: { ...current.cliente, ...atualizado } }));
        setEditing(false);
        toast.success(copy.messages.updateSuccess);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : copy.messages.updateError);
      }
    });
  }

  function archive() {
    if (!confirm(copy.messages.archiveConfirm.replace("{name}", cliente.nome))) return;
    startTransition(async () => {
      try {
        await actionArquivarCliente(cliente.id);
        toast.success(copy.messages.archiveSuccess);
        router.push("/clientes");
      } catch {
        toast.error(copy.messages.archiveError);
      }
    });
  }

  function exportarDados() {
    startTransition(async () => {
      try {
        const pacote = await actionExportarDadosCliente(cliente.id);
        const blob = new Blob([JSON.stringify(pacote, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `lgpd-cliente-${cliente.id}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        toast.success("Pacote LGPD gerado.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Erro ao exportar dados do cliente.");
      }
    });
  }

  function adicionarAnotacao(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const texto = (new FormData(form).get("texto") as string || "").trim();
    if (!texto) return;
    startTransition(async () => {
      try {
        const nova = await actionCriarAnotacao(cliente.id, texto);
        setData((current) => ({ ...current, anotacoes: [nova as ClienteData["anotacoes"][number], ...current.anotacoes] }));
        form.reset();
        toast.success(copy.messages.noteSuccess);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : copy.messages.noteError);
      }
    });
  }

  function revogar(consentimentoId: string) {
    if (!confirm("Revogar este consentimento? Execucoes futuras ligadas a ele serao bloqueadas.")) return;
    startTransition(async () => {
      try {
        const atualizado = await actionRevogarConsentimento(consentimentoId, cliente.id);
        setData((current) => ({
          ...current,
          consentimentos: current.consentimentos.map((item) =>
            item.id === consentimentoId ? { ...item, status: atualizado.status } : item
          ),
        }));
        toast.success("Consentimento revogado.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Erro ao revogar consentimento.");
      }
    });
  }

  return (
    <div className="space-y-6" data-testid="cliente-360">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => router.push("/clientes")} className="min-h-11 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={17} /> {copy.actions.back}
        </button>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setEditing((value) => !value)} className="min-h-11 px-4 rounded-xl border border-border text-sm font-medium inline-flex items-center gap-2">
            {editing ? <X size={16} /> : <Pencil size={16} />}
            {editing ? copy.actions.cancel : copy.actions.edit}
          </button>
          {canArchive && (
            <button type="button" disabled={pending} onClick={archive} className="min-h-11 px-4 rounded-xl border border-destructive/30 text-sm font-medium text-destructive inline-flex items-center gap-2 disabled:opacity-50">
              <Archive size={16} /> {copy.actions.archive}
            </button>
          )}
          {canManageLgpd && (
            <button type="button" disabled={pending} onClick={exportarDados} className="min-h-11 px-4 rounded-xl border border-border text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50">
              <Download size={16} /> Exportar LGPD
            </button>
          )}
        </div>
      </div>

      <section className="rounded-[1.25rem] border border-border bg-card p-5">
        {editing ? (
          <form action={submit} className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1.5 text-sm"><span>{copy.fields.name}</span><input name="nome" required minLength={2} defaultValue={cliente.nome} className="w-full min-h-11 rounded-xl border border-border bg-background px-3" /></label>
            <label className="space-y-1.5 text-sm"><span>{copy.fields.document}</span><input name="cpfCnpj" defaultValue={cliente.cpfCnpj ?? ""} className="w-full min-h-11 rounded-xl border border-border bg-background px-3" /></label>
            <label className="space-y-1.5 text-sm"><span>{copy.fields.email}</span><input name="email" type="email" defaultValue={cliente.email ?? ""} className="w-full min-h-11 rounded-xl border border-border bg-background px-3" /></label>
            <label className="space-y-1.5 text-sm"><span>{copy.fields.phone}</span><input name="telefone" defaultValue={cliente.telefone ?? ""} className="w-full min-h-11 rounded-xl border border-border bg-background px-3" /></label>
            <button disabled={pending} className="md:col-span-2 min-h-11 justify-self-start px-5 rounded-xl text-white font-semibold inline-flex items-center gap-2 disabled:opacity-50" style={{ background: "var(--gradient-signature)" }}>
              <Check size={17} /> {pending ? copy.actions.saving : copy.actions.save}
            </button>
          </form>
        ) : (
          <div>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h1 className="text-2xl font-bold text-foreground">{cliente.nome}</h1><p className="text-sm text-muted-foreground mt-1">{cliente.email ?? copy.emptyValue} · {cliente.telefone ?? copy.emptyValue}</p></div>
              <div className="flex flex-wrap gap-2">{data.tags.map((tag) => <span key={tag.id} className="px-2.5 py-1 rounded-full text-xs font-semibold" style={{ color: tag.cor ?? undefined, background: `${tag.cor ?? "#64748b"}20` }}>{tag.nome}</span>)}</div>
            </div>
            <dl className="grid gap-3 sm:grid-cols-3 mt-5 text-sm">
              <div><dt className="text-muted-foreground">{copy.fields.document}</dt><dd className="font-medium mt-1">{cliente.cpfCnpj ?? copy.emptyValue}</dd></div>
              <div><dt className="text-muted-foreground">{copy.metrics.orders}</dt><dd className="font-semibold text-lg mt-1">{data.pedidos.length}</dd></div>
              <div><dt className="text-muted-foreground">{copy.metrics.tasks}</dt><dd className="font-semibold text-lg mt-1">{data.tarefas.length}</dd></div>
            </dl>
          </div>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <section className="rounded-[1.25rem] border border-border bg-card overflow-hidden">
          <h2 className="font-semibold px-5 py-4 border-b border-border">{copy.timelineTitle}</h2>
          <div className="divide-y divide-border">
            {[...data.interacoes.map((item) => ({ key: `i-${item.id}`, title: item.resumo ?? item.tipo, meta: `${item.canal ?? item.tipo} · ${formatDate(item.createdAt)}` })), ...data.pedidos.map((item) => ({ key: `p-${item.id}`, title: `${copy.orderPrefix} · R$ ${Number(item.total).toFixed(2)}`, meta: `${item.canal} · ${item.status} · ${formatDate(item.createdAt)}` }))]
              .map((item) => <div key={item.key} className="px-5 py-4"><p className="text-sm font-medium">{item.title}</p><p className="text-xs text-muted-foreground mt-1">{item.meta}</p></div>)}
            {data.interacoes.length + data.pedidos.length === 0 && <p className="p-5 text-sm text-muted-foreground">{copy.timelineEmpty}</p>}
          </div>
        </section>

        <div className="space-y-6">
          <section className="rounded-[1.25rem] border border-border bg-card overflow-hidden">
            <h2 className="font-semibold px-5 py-4 border-b border-border">{copy.tasksTitle}</h2>
            <div className="divide-y divide-border">{data.tarefas.map((item) => <div key={item.id} className="px-5 py-3"><p className="text-sm font-medium">{item.titulo}</p><p className="text-xs text-muted-foreground mt-1">{item.status} · {formatDate(item.vencimentoEm)}</p></div>)}{data.tarefas.length === 0 && <p className="p-5 text-sm text-muted-foreground">{copy.tasksEmpty}</p>}</div>
          </section>
          <section className="rounded-[1.25rem] border border-border bg-card overflow-hidden">
            <h2 className="font-semibold px-5 py-4 border-b border-border">{copy.notesTitle}</h2>
            <form onSubmit={adicionarAnotacao} className="flex gap-2 px-5 py-3 border-b border-border">
              <input name="texto" maxLength={2000} placeholder={copy.notesPlaceholder} className="flex-1 min-h-11 rounded-xl border border-border bg-background px-3 text-sm" />
              <button type="submit" disabled={pending} className="min-h-11 px-4 rounded-xl bg-foreground text-sm font-semibold text-background disabled:opacity-50">
                {pending ? copy.actions.savingNote : copy.actions.addNote}
              </button>
            </form>
            <div className="divide-y divide-border max-h-72 overflow-y-auto">
              {data.anotacoes.map((item) => (
                <div key={item.id} className="px-5 py-3">
                  <p className="text-sm">{item.resumo}</p>
                  <p className="text-xs text-muted-foreground mt-1">{formatDate(item.createdAt)}</p>
                </div>
              ))}
              {data.anotacoes.length === 0 && <p className="p-5 text-sm text-muted-foreground">{copy.notesEmpty}</p>}
            </div>
          </section>
          <section className="rounded-[1.25rem] border border-border bg-card overflow-hidden">
            <h2 className="font-semibold px-5 py-4 border-b border-border">{copy.consentsTitle}</h2>
            <div className="divide-y divide-border">
              {data.consentimentos.map((item) => (
                <div key={item.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <span className="text-sm">{item.finalidade} · {item.canal}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold ${item.status === "ativo" ? "text-[#1F8A4C]" : "text-muted-foreground"}`}>{item.status}</span>
                    {canManageLgpd && item.status === "ativo" && (
                      <button type="button" disabled={pending} onClick={() => revogar(item.id)} title="Revogar consentimento" className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50">
                        <ShieldOff size={15} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {data.consentimentos.length === 0 && <p className="p-5 text-sm text-muted-foreground">{copy.consentsEmpty}</p>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
