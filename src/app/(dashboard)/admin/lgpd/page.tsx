"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Download, Plus, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/shared/design-system/primitives/PageHeader";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { SectionCard } from "@/shared/design-system/primitives/SectionCard";
import { SkeletonRow } from "@/shared/design-system/primitives/Skeleton";
import {
  actionAnonimizarSolicitacaoLgpd,
  actionConcluirExportacaoLgpd,
  actionCriarSolicitacaoLgpd,
  actionListarClientesLgpd,
  actionListarSolicitacoesLgpd,
  actionRejeitarSolicitacaoLgpd,
} from "./actions";

type Solicitacao = Awaited<ReturnType<typeof actionListarSolicitacoesLgpd>>["solicitacoes"][number];
type ClienteResumo = Awaited<ReturnType<typeof actionListarClientesLgpd>>[number];

const tipoLabel: Record<Solicitacao["tipo"], string> = {
  exportacao: "Exportacao",
  revogacao: "Revogacao",
  anonimizacao: "Anonimizacao",
  exclusao: "Exclusao",
};

const statusTone: Record<Solicitacao["status"], string> = {
  aberta: "bg-[#2563EB]/10 text-[#2563EB]",
  em_analise: "bg-[#B57A00]/10 text-[#B57A00]",
  concluida: "bg-[#1F8A4C]/10 text-[#1F8A4C]",
  rejeitada: "bg-[#C21820]/10 text-[#C21820]",
};

function baixarJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatarData(value: Date | string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export default function AdminLgpdPage() {
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [clientes, setClientes] = useState<ClienteResumo[]>([]);
  const [clienteId, setClienteId] = useState("");
  const [tipo, setTipo] = useState<Solicitacao["tipo"]>("exportacao");
  const [motivo, setMotivo] = useState("");
  const [confirmacaoPorId, setConfirmacaoPorId] = useState<Record<string, string>>({});
  const [motivoRejeicaoPorId, setMotivoRejeicaoPorId] = useState<Record<string, string>>({});
  const [lgpdDisponivel, setLgpdDisponivel] = useState(true);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const clienteSelecionado = useMemo(
    () => clientes.find((item) => item.id === clienteId),
    [clientes, clienteId],
  );

  async function carregar() {
    setLoading(true);
    try {
      const [novasSolicitacoes, clientesDisponiveis] = await Promise.all([
        actionListarSolicitacoesLgpd(),
        actionListarClientesLgpd(),
      ]);
      setLgpdDisponivel(novasSolicitacoes.available);
      setSolicitacoes(novasSolicitacoes.solicitacoes);
      setClientes(clientesDisponiveis);
      setClienteId((atual) => atual || clientesDisponiveis[0]?.id || "");
    } catch {
      toast.error("Nao foi possivel carregar LGPD.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    Promise.all([
      actionListarSolicitacoesLgpd(),
      actionListarClientesLgpd(),
    ])
      .then(([novasSolicitacoes, clientesDisponiveis]) => {
        setLgpdDisponivel(novasSolicitacoes.available);
        setSolicitacoes(novasSolicitacoes.solicitacoes);
        setClientes(clientesDisponiveis);
        setClienteId((atual) => atual || clientesDisponiveis[0]?.id || "");
      })
      .catch(() => toast.error("Nao foi possivel carregar LGPD."))
      .finally(() => setLoading(false));
  }, []);

  function criarSolicitacao() {
    startTransition(async () => {
      try {
        await actionCriarSolicitacaoLgpd({ clienteId, tipo, motivo: motivo || undefined });
        setMotivo("");
        toast.success("Solicitacao LGPD aberta.");
        await carregar();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Nao foi possivel abrir solicitacao.");
      }
    });
  }

  function concluirExportacao(item: Solicitacao) {
    startTransition(async () => {
      try {
        const result = await actionConcluirExportacaoLgpd(item.id);
        baixarJson(`lgpd-${item.clienteId}.json`, result.pacote);
        toast.success("Exportacao concluida e baixada.");
        await carregar();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Nao foi possivel exportar.");
      }
    });
  }

  function anonimizar(item: Solicitacao) {
    startTransition(async () => {
      try {
        await actionAnonimizarSolicitacaoLgpd({
          solicitacaoId: item.id,
          confirmacao: confirmacaoPorId[item.id],
        });
        setConfirmacaoPorId((current) => ({ ...current, [item.id]: "" }));
        toast.success("Cliente anonimizado.");
        await carregar();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Nao foi possivel anonimizar.");
      }
    });
  }

  function rejeitar(item: Solicitacao) {
    startTransition(async () => {
      try {
        await actionRejeitarSolicitacaoLgpd({
          solicitacaoId: item.id,
          motivo: motivoRejeicaoPorId[item.id],
        });
        setMotivoRejeicaoPorId((current) => ({ ...current, [item.id]: "" }));
        toast.success("Solicitacao rejeitada.");
        await carregar();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Nao foi possivel rejeitar.");
      }
    });
  }

  return (
    <div>
      <PageHeader
        title="Solicitacoes LGPD"
        description="Controle exportacao, revogacao, anonimizacao e exclusao com auditoria."
      />

      <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
        <SectionCard title="Abrir solicitacao" icon={Plus}>
          <div className="grid gap-3">
            <select
              value={clienteId}
              onChange={(event) => setClienteId(event.target.value)}
              className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm"
            >
              {clientes.map((clienteItem) => (
                <option key={clienteItem.id} value={clienteItem.id}>
                  {clienteItem.nome} {clienteItem.email ? `- ${clienteItem.email}` : ""}
                </option>
              ))}
            </select>
            <select
              value={tipo}
              onChange={(event) => setTipo(event.target.value as Solicitacao["tipo"])}
              className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm"
            >
              {Object.entries(tipoLabel).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <textarea
              value={motivo}
              onChange={(event) => setMotivo(event.target.value)}
              placeholder="Origem, prova ou observacao da solicitacao"
              className="min-h-28 resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={criarSolicitacao}
              disabled={pending || !clienteSelecionado || !lgpdDisponivel}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--gradient-signature)" }}
            >
              <ShieldCheck size={15} /> Registrar
            </button>
          </div>
        </SectionCard>

        <SectionCard title="Fila LGPD" icon={ShieldCheck}>
            {!lgpdDisponivel && (
              <div className="mb-4 rounded-xl border border-[#B57A00]/30 bg-[#B57A00]/10 px-4 py-3 text-sm text-[#B57A00]">
                Migration LGPD 0014 ainda nao foi aplicada no banco conectado. A tela esta pronta, mas a fila fica bloqueada ate a aplicacao controlada da migration.
              </div>
            )}
            {loading ? (
              <div className="-mx-6 -my-6 divide-y divide-border"><SkeletonRow /><SkeletonRow /><SkeletonRow /></div>
            ) : solicitacoes.length === 0 ? (
              <EmptyState illustration="generic" title="Nenhuma solicitacao" description="Solicitacoes LGPD abertas aparecerao aqui." />
            ) : (
              <div className="grid gap-3">
                {solicitacoes.map((item) => {
                  const aberta = item.status === "aberta" || item.status === "em_analise";
                  const podeAnonimizar = aberta && (item.tipo === "anonimizacao" || item.tipo === "exclusao");
                  const podeExportar = aberta && item.tipo === "exportacao";
                  return (
                    <article key={item.id} className="rounded-xl border border-border bg-background/60 p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-foreground">{item.clienteNome}</p>
                            <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                              {tipoLabel[item.tipo]}
                            </span>
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusTone[item.status]}`}>
                              {item.status.replace("_", " ")}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.clienteEmail ?? "Sem e-mail"} - aberta em {formatarData(item.createdAt)}
                          </p>
                          {item.motivo && <p className="mt-2 text-sm text-muted-foreground">{item.motivo}</p>}
                        </div>
                        {aberta && (
                          <div className="flex flex-col gap-2 lg:w-[360px]">
                            {podeExportar && (
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() => concluirExportacao(item)}
                                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#1F8A4C] px-4 text-sm font-semibold text-white disabled:opacity-50"
                              >
                                <Download size={15} /> Exportar JSON
                              </button>
                            )}
                            {podeAnonimizar && (
                              <>
                                <input
                                  value={confirmacaoPorId[item.id] ?? ""}
                                  onChange={(event) => setConfirmacaoPorId((current) => ({ ...current, [item.id]: event.target.value }))}
                                  placeholder="Digite ANONIMIZAR"
                                  className="min-h-11 rounded-xl border border-border bg-card px-3 text-sm"
                                />
                                <button
                                  type="button"
                                  disabled={pending || confirmacaoPorId[item.id] !== "ANONIMIZAR"}
                                  onClick={() => anonimizar(item)}
                                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#C21820] px-4 text-sm font-semibold text-white disabled:opacity-50"
                                >
                                  <Trash2 size={15} /> Anonimizar
                                </button>
                              </>
                            )}
                            <div className="grid grid-cols-[1fr_auto] gap-2">
                              <input
                                value={motivoRejeicaoPorId[item.id] ?? ""}
                                onChange={(event) => setMotivoRejeicaoPorId((current) => ({ ...current, [item.id]: event.target.value }))}
                                placeholder="Motivo da rejeicao"
                                className="min-h-11 rounded-xl border border-border bg-card px-3 text-sm"
                              />
                              <button
                                type="button"
                                disabled={pending || !motivoRejeicaoPorId[item.id]?.trim()}
                                onClick={() => rejeitar(item)}
                                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-muted text-muted-foreground hover:text-[#C21820] disabled:opacity-50"
                                title="Rejeitar"
                              >
                                <XCircle size={16} />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
        </SectionCard>
      </div>
    </div>
  );
}
