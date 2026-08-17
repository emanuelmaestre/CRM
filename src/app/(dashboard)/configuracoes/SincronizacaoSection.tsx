"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { tint } from "@/shared/design-system/color";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Clock3, Info, Loader2, MinusCircle, RefreshCw, Sparkles, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { ChannelLogo } from "@/shared/design-system/primitives/ChannelLogo";
import { getBrandConfig } from "@/shared/config/brands";
import { actionDispararSincronizacaoConta, actionObterUltimaSincronizacaoConta } from "./actions";
import type { CanalConfiguracao } from "@/modules/canais/application/configuracao-canais.service";

type Execucao = NonNullable<Awaited<ReturnType<typeof actionObterUltimaSincronizacaoConta>>>;
type ModuloStatus = "pendente" | "em_andamento" | "concluido" | "erro";

const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

const MODULOS = [
  {
    chave: "catalogoStatus",
    resultado: "catalogoResultado",
    label: "Catálogo",
    descricao: "Produtos, SKUs, variações, preços e saldo que o canal informa.",
  },
  {
    chave: "pedidosStatus",
    resultado: "pedidosResultado",
    label: "Pedidos",
    descricao: "Vendas recentes, clientes, itens e status para alimentar CRM e estoque.",
  },
  {
    chave: "anunciosStatus",
    resultado: "anunciosResultado",
    label: "Product Ads",
    descricao: "Campanhas, anúncios e métricas de mídia paga usadas no módulo Anúncios.",
  },
  {
    chave: "avaliacoesStatus",
    resultado: "avaliacoesResultado",
    label: "Avaliações",
    descricao: "Notas, opiniões e média dos anúncios ativos para satisfação e reputação.",
  },
  {
    chave: "reputacaoStatus",
    resultado: "reputacaoResultado",
    label: "Termômetro",
    descricao: "Faixa de reputação, Mercado Líder e taxas que afetam a saúde da loja.",
  },
  {
    chave: "reclamacoesStatus",
    resultado: "reclamacoesResultado",
    label: "Reclamações",
    descricao: "Reclamações abertas e mediações que exigem atenção no pós-venda.",
  },
  {
    chave: "mensagensStatus",
    resultado: "mensagensResultado",
    label: "Mensagens",
    descricao: "Conversas pós-venda recentes que podem não ter chegado por webhook.",
  },
] as const;

function resultadoSemSuporte(resultado: unknown): boolean {
  return Boolean(
    resultado
      && typeof resultado === "object"
      && "semSuporte" in resultado
      && (resultado as { semSuporte?: unknown }).semSuporte === true,
  );
}

function useNumeroAnimado(valor: number, duracao = 700) {
  const [exibido, setExibido] = useState(valor);
  const anterior = useRef(valor);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduzirMovimento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const de = anterior.current;
    if (reduzirMovimento || de === valor) {
      anterior.current = valor;
      setExibido(valor);
      return;
    }
    const inicio = performance.now();
    let frame = requestAnimationFrame(function passo(agora: number) {
      const progresso = Math.min((agora - inicio) / duracao, 1);
      const suavizado = 1 - Math.pow(1 - progresso, 3);
      const atual = de + (valor - de) * suavizado;
      anterior.current = atual;
      setExibido(atual);
      if (progresso < 1) frame = requestAnimationFrame(passo);
    });
    return () => cancelAnimationFrame(frame);
  }, [valor, duracao]);

  return exibido;
}

function SeloModulo({ label, status, resultado }: { label: string; status: ModuloStatus; resultado: unknown }) {
  const ignorado = status === "concluido" && resultadoSemSuporte(resultado);
  const config = ignorado ? {
    icon: MinusCircle,
    cor: "var(--muted-foreground)",
    bg: "var(--muted)",
    texto: "Sem suporte",
  } : {
    pendente: { icon: null, cor: "var(--muted-foreground)", bg: "transparent", texto: "Na fila" },
    em_andamento: { icon: Loader2, cor: "var(--acento-2)", bg: tint("var(--acento-2)", 8), texto: "Sincronizando…" },
    concluido: { icon: CheckCircle2, cor: "var(--success)", bg: tint("var(--success)", 8), texto: "Concluído" },
    erro: { icon: XCircle, cor: "var(--destructive)", bg: tint("var(--destructive)", 8), texto: "Falhou" },
  }[status];
  const Icon = config.icon;

  return (
    <motion.div
      layout
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1"
      style={{ background: config.bg }}
    >
      {Icon && (
        <Icon size={12} strokeWidth={2.5} className={status === "em_andamento" ? "animate-spin" : ""} style={{ color: config.cor }} />
      )}
      <span className="text-[11px] font-semibold" style={{ color: status === "pendente" ? "var(--muted-foreground)" : config.cor }}>
        {label} · {config.texto}
      </span>
    </motion.div>
  );
}

function percentualExecucao(execucao: Execucao | null) {
  if (!execucao) return 0;
  const pontos = MODULOS.reduce((total, modulo) => {
    const status = execucao[modulo.chave] as ModuloStatus;
    if (status === "concluido" || status === "erro") return total + 1;
    if (status === "em_andamento") return total + 0.45;
    return total;
  }, 0);
  return Math.round((pontos / MODULOS.length) * 100);
}

function ProgressoCircular({ valor, emAndamento, comErro }: { valor: number; emAndamento: boolean; comErro: boolean }) {
  const animado = useNumeroAnimado(valor);
  const cor = comErro ? "var(--destructive)" : valor >= 100 ? "var(--success)" : "var(--acento-2)";

  return (
    <div
      className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full p-[2px] shadow-inner"
      style={{ background: `conic-gradient(${cor} ${Math.max(0, Math.min(animado, 100)) * 3.6}deg, var(--muted) 0deg)` }}
    >
      {emAndamento && (
        <motion.span
          aria-hidden="true"
          className="absolute inset-[-3px] rounded-full border border-primary/25"
          animate={{ scale: [1, 1.16], opacity: [0.55, 0] }}
          transition={{ duration: 1.25, repeat: Infinity, ease: "easeOut" }}
        />
      )}
      <div className="grid h-full w-full place-items-center rounded-full bg-card">
        <span className="text-[11px] font-black tabular-nums text-foreground">{Math.round(animado)}%</span>
      </div>
    </div>
  );
}

function rotuloUltima(execucao: Execucao | null) {
  if (!execucao) return "Nenhuma sincronização manual ainda";
  const data = new Date(execucao.finalizadoEm ?? execucao.iniciadoEm);
  if (!execucao.finalizadoEm) return `Em andamento desde ${dataHora.format(data)}`;
  return `Última sync: ${dataHora.format(data)}`;
}

function SincronizacaoInfo({ conta, execucao }: { conta: CanalConfiguracao; execucao: Execucao | null }) {
  const mercadoLivre = conta.canal === "mercadolivre";
  const descricaoCanal = mercadoLivre
    ? "No Mercado Livre, este clique força a fila completa: catálogo, pedidos, Product Ads, avaliações, termômetro, reclamações e mensagens."
    : `Para ${conta.canalLabel}, o botão executa os módulos que o conector já suporta e marca o restante como sem suporte, sem travar a tela.`;

  return (
    <DialogPrimitive.Root>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label={`Explicar sincronização de ${conta.canalLabel} ${conta.brandLabel}`}
          title="O que este botão sincroniza"
          className="press-feedback inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Info aria-hidden="true" size={14} strokeWidth={2.3} />
        </button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=open]:animate-in" />
        <DialogPrimitive.Content
          className="fixed inset-x-3 bottom-3 z-50 flex max-h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-[1.1rem] border border-border bg-card text-left shadow-[0_18px_48px_rgba(14,15,19,.24)] outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[min(34rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2"
        >
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[.08em] text-muted-foreground">Central de sincronização</p>
              <DialogPrimitive.Title className="mt-1 text-[15px] font-bold text-foreground">
                Sincronizar tudo desta conta
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                {conta.canalLabel} · {conta.brandLabel}
              </DialogPrimitive.Description>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Sparkles aria-hidden="true" size={18} className="text-primary" />
              <DialogPrimitive.Close asChild>
                <button
                  type="button"
                  aria-label="Fechar explicação"
                  className="press-feedback inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X size={17} />
                </button>
              </DialogPrimitive.Close>
            </div>
          </div>

          <div className="min-h-0 overflow-y-auto px-5 py-4">
            <p className="text-[13px] leading-relaxed text-foreground/85">{descricaoCanal}</p>

            <p className="mt-4 text-[11px] font-bold uppercase tracking-[.07em] text-muted-foreground">O que entra na fila</p>
            <div className="mt-2 grid gap-2">
              {MODULOS.map((modulo) => (
                <div key={modulo.chave} className="rounded-lg border border-border bg-muted/35 px-3 py-2">
                  <p className="text-[12px] font-bold text-foreground">{modulo.label}</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{modulo.descricao}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 border-t border-border pt-3">
              <p className="text-[11px] font-bold uppercase tracking-[.07em] text-muted-foreground">Como acompanhar</p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                A porcentagem sobe conforme cada módulo sai de “na fila” para “sincronizando” e depois “concluído”. Se um módulo falhar, ele aparece em vermelho e os demais continuam.
              </p>
              <p className="mt-2 text-[12px] font-semibold text-foreground">{rotuloUltima(execucao)}</p>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function LinhaConta({ conta }: { conta: CanalConfiguracao }) {
  const [execucao, setExecucao] = useState<Execucao | null>(null);
  const [disparando, setDisparando] = useState(false);
  const intervalo = useRef<ReturnType<typeof setInterval> | null>(null);
  const consultarRef = useRef<() => Promise<void>>(async () => {});

  const pararPolling = useCallback(() => {
    if (intervalo.current) clearInterval(intervalo.current);
    intervalo.current = null;
  }, []);

  const iniciarPolling = useCallback(() => {
    if (intervalo.current) return;
    intervalo.current = setInterval(() => void consultarRef.current(), 1500);
  }, []);

  const consultar = useCallback(async () => {
    if (!conta.channelAccountId) return;
    const resultado = await actionObterUltimaSincronizacaoConta(conta.channelAccountId);
    setExecucao(resultado);
    if (resultado && !resultado.finalizadoEm) iniciarPolling();
    if (resultado && resultado.finalizadoEm) pararPolling();
  }, [conta.channelAccountId, iniciarPolling, pararPolling]);

  useEffect(() => {
    consultarRef.current = consultar;
  }, [consultar]);

  useEffect(() => {
    const task = window.setTimeout(() => void consultar(), 0);
    return () => { window.clearTimeout(task); pararPolling(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sincronizar() {
    if (!conta.channelAccountId) return;
    setDisparando(true);
    try {
      const nova = await actionDispararSincronizacaoConta(conta.channelAccountId);
      setExecucao({
        ...nova,
        catalogoResultado: null,
        pedidosResultado: null,
        anunciosResultado: null,
        avaliacoesResultado: null,
        reputacaoResultado: null,
        reclamacoesResultado: null,
        mensagensResultado: null,
      } as Execucao);
      pararPolling();
      iniciarPolling();
      toast.success("Sincronização completa iniciada. Vou acompanhando o progresso aqui.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível iniciar a sincronização.");
    } finally {
      setDisparando(false);
    }
  }

  const emAndamento = execucao !== null && !execucao.finalizadoEm;
  const corMarca = getBrandConfig(conta.brand)?.color;
  const percentual = percentualExecucao(execucao);
  const comErro = Boolean(execucao && MODULOS.some((modulo) => execucao[modulo.chave] === "erro"));
  const modulosResolvidos = execucao
    ? MODULOS.filter((modulo) => {
        const status = execucao[modulo.chave] as ModuloStatus;
        return status === "concluido" || status === "erro";
      }).length
    : 0;
  const statusResumo = !execucao
    ? "Aguardando primeira sincronização"
    : emAndamento
      ? "Atualizando tudo"
      : comErro
        ? "Finalizada com alerta"
        : "Sincronização completa";

  return (
    <div className="flex flex-col gap-3 border-b border-border py-3 last:border-0 xl:flex-row xl:items-center xl:justify-between">
      <div className="flex items-center gap-2.5">
        <ChannelLogo canal={conta.canal} size="sm" variant="badge" />
        <div>
          <p className="text-sm font-semibold text-foreground">{conta.canalLabel}</p>
          <p className="text-xs" style={{ color: corMarca }}>{conta.brandLabel}</p>
        </div>
      </div>

      <div className="flex flex-col gap-2 xl:items-end">
        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-muted px-2.5 text-[11px] font-semibold text-muted-foreground">
            <Clock3 size={12} />
            {rotuloUltima(execucao)}
          </span>
          <SincronizacaoInfo conta={conta} execucao={execucao} />

          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={sincronizar}
            disabled={disparando || emAndamento}
            className="press-feedback inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
          >
            <RefreshCw size={13} className={disparando || emAndamento ? "animate-spin" : ""} />
            {emAndamento ? "Sincronizando…" : "Sincronizar"}
          </motion.button>
        </div>

        <AnimatePresence mode="popLayout">
          {execucao && (
            <motion.div
              key="status"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-wrap items-center gap-2 xl:justify-end"
            >
              <div className="flex items-center gap-2 rounded-full border border-border bg-background/70 px-2.5 py-1.5">
                <ProgressoCircular valor={percentual} emAndamento={emAndamento} comErro={comErro} />
                <div className="min-w-0 pr-1">
                  <p className="text-[11px] font-bold text-foreground">{statusResumo}</p>
                  <p className="text-[10px] font-medium text-muted-foreground">{modulosResolvidos} de {MODULOS.length} módulos resolvidos</p>
                </div>
              </div>
              <div className="flex max-w-[46rem] flex-wrap items-center gap-1.5">
                {MODULOS.map((modulo) => (
                  <SeloModulo
                    key={modulo.chave}
                    label={modulo.label}
                    status={execucao[modulo.chave] as ModuloStatus}
                    resultado={execucao[modulo.resultado]}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** Central de Sincronização — um "Sincronizar" por conta conectada, fila
 *  completa rodando em background (Inngest) em vez de travar a tela por
 *  20s+ numa chamada síncrona. A tela só faz polling do status. */
export function SincronizacaoSection({ canais }: { canais: CanalConfiguracao[] }) {
  const conectadas = canais.filter((item) => item.channelAccountId && item.status === "conectado");

  if (conectadas.length === 0) {
    return <p className="text-sm text-muted-foreground">Conecte uma conta de canal para poder sincronizar.</p>;
  }

  return (
    <div>
      {conectadas.map((conta) => (
        <LinhaConta key={conta.channelAccountId} conta={conta} />
      ))}
    </div>
  );
}
