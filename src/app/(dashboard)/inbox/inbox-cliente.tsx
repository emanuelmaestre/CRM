"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import { toast } from "sonner";
import { actionListarConversas, actionListarMensagens } from "./actions";

type Conversa = Awaited<ReturnType<typeof actionListarConversas>>[number];
type Mensagem = Awaited<ReturnType<typeof actionListarMensagens>>[number];

const STATUS_LABEL: Record<string, string> = {
  nova: "Nova",
  em_atendimento: "Em atendimento",
  aguardando_cliente: "Aguardando",
  resolvida: "Resolvida",
  arquivada: "Arquivada",
};

const STATUS_COLOR: Record<string, string> = {
  nova: "#E3131B",
  em_atendimento: "#9B30D9",
  aguardando_cliente: "#F59E0B",
  resolvida: "#10B981",
  arquivada: "var(--muted-foreground)",
};

function formatarData(iso: Date | string): string {
  const d = new Date(iso);
  const agora = new Date();
  const diff = agora.getTime() - d.getTime();
  if (diff < 60_000) return "agora";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function InboxCliente() {
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [selecionada, setSelecionada] = useState<Conversa | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [, startTransition] = useTransition();

  const carregarConversas = useCallback(() => {
    startTransition(async () => {
      setLoading(true);
      try {
        const data = await actionListarConversas();
        setConversas(data);
      } catch {
        toast.error("Erro ao carregar conversas.");
      } finally {
        setLoading(false);
      }
    });
  }, []);

  useEffect(() => { carregarConversas(); }, [carregarConversas]);

  function abrirConversa(c: Conversa) {
    setSelecionada(c);
    setLoadingMsgs(true);
    startTransition(async () => {
      try {
        const msgs = await actionListarMensagens(c.id);
        setMensagens(msgs);
      } catch {
        toast.error("Erro ao carregar mensagens.");
      } finally {
        setLoadingMsgs(false);
      }
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
        Carregando conversas…
      </div>
    );
  }

  if (conversas.length === 0) {
    return (
      <div className="rounded-[1.25rem] border border-border bg-card p-8 text-center">
        <p className="text-3xl mb-3">💬</p>
        <p className="text-sm font-semibold text-foreground">Nenhuma conversa ainda</p>
        <p className="text-sm text-muted-foreground mt-1">
          As mensagens chegam aqui assim que os conectores forem ativados em{" "}
          <span className="font-medium text-foreground">Configurações → Integrações</span>.
        </p>
      </div>
    );
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-10rem)]">
      {/* Lista de conversas */}
      <div className="w-80 flex-shrink-0 rounded-[1.25rem] border border-border bg-card overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-sm font-semibold text-foreground">{conversas.length} conversa{conversas.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="overflow-y-auto flex-1">
          {conversas.map((c) => (
            <button
              key={c.id}
              onClick={() => abrirConversa(c)}
              className={`w-full text-left px-4 py-3 border-b border-border last:border-0 hover:bg-muted/50 transition-colors ${selecionada?.id === c.id ? "bg-muted" : ""}`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                  style={{ background: STATUS_COLOR[c.status] + "20", color: STATUS_COLOR[c.status] }}
                >
                  {STATUS_LABEL[c.status] ?? c.status}
                </span>
                <span className="text-[10px] text-muted-foreground flex-shrink-0">
                  {formatarData(c.updatedAt)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate">{c.externalId ?? c.id.slice(0, 8)}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Painel de mensagens */}
      <div className="flex-1 rounded-[1.25rem] border border-border bg-card overflow-hidden flex flex-col">
        {!selecionada ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            Selecione uma conversa
          </div>
        ) : loadingMsgs ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            Carregando mensagens…
          </div>
        ) : (
          <>
            <div className="px-4 py-3 border-b border-border">
              <p className="text-sm font-semibold text-foreground">
                {selecionada.externalId ?? selecionada.id.slice(0, 8)}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-4 flex flex-col-reverse gap-2">
              {mensagens.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center">Sem mensagens ainda.</p>
              ) : (
                [...mensagens].reverse().map((m) => (
                  <div
                    key={m.id}
                    className={`max-w-[70%] rounded-[0.75rem] px-3 py-2 text-sm ${
                      m.direcao === "saida"
                        ? "ml-auto text-white"
                        : "mr-auto bg-muted text-foreground"
                    }`}
                    style={m.direcao === "saida" ? { background: "var(--gradient-signature)" } : undefined}
                  >
                    <p>{m.conteudo}</p>
                    <p className={`text-[10px] mt-1 ${m.direcao === "saida" ? "text-white/70 text-right" : "text-muted-foreground"}`}>
                      {formatarData(m.createdAt)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
