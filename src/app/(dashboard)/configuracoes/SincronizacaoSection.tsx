"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { tint } from "@/shared/design-system/color";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { AlertTriangle, CheckCircle2, ChevronDown, Clock3, Loader2, MinusCircle, RefreshCw, Sparkles, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { ChannelLogo } from "@/shared/design-system/primitives/ChannelLogo";
import { AnimatedInfoTrigger } from "@/shared/design-system/primitives/AnimatedInfoPopover";
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
    erro: "catalogoErro",
    label: "Catálogo",
    descricao: "Produtos, SKUs, variações, preços e saldo que o canal informa.",
  },
  {
    chave: "pedidosStatus",
    resultado: "pedidosResultado",
    erro: "pedidosErro",
    label: "Pedidos",
    descricao: "Vendas recentes, clientes, itens e status para alimentar CRM e estoque.",
  },
  {
    chave: "anunciosStatus",
    resultado: "anunciosResultado",
    erro: "anunciosErro",
    label: "Product Ads",
    descricao: "Campanhas, anúncios e métricas de mídia paga usadas no módulo Anúncios.",
  },
  {
    chave: "avaliacoesStatus",
    resultado: "avaliacoesResultado",
    erro: "avaliacoesErro",
    label: "Avaliações",
    descricao: "Notas, opiniões e média dos anúncios ativos para satisfação e reputação.",
  },
  {
    chave: "reputacaoStatus",
    resultado: "reputacaoResultado",
    erro: "reputacaoErro",
    label: "Termômetro",
    descricao: "Faixa de reputação, Mercado Líder e taxas que afetam a saúde da loja.",
  },
  {
    chave: "reclamacoesStatus",
    resultado: "reclamacoesResultado",
    erro: "reclamacoesErro",
    label: "Reclamações",
    descricao: "Reclamações abertas e mediações que exigem atenção no pós-venda.",
  },
  {
    chave: "mensagensStatus",
    resultado: "mensagensResultado",
    erro: "mensagensErro",
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

function SeloModulo({ label, status, resultado, erro }: { label: string; status: ModuloStatus; resultado: unknown; erro?: string | null }) {
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
    erro: { icon: XCircle, cor: "var(--destructive)", bg: tint("var(--destructive)", 16), texto: "Falhou" },
  }[status];
  const Icon = config.icon;
  const conteudo = (
    <>
      {Icon && (
        <Icon size={12} strokeWidth={2.5} className={status === "em_andamento" ? "animate-spin" : ""} style={{ color: config.cor }} />
      )}
      <span className="text-[11px] font-semibold" style={{ color: status === "pendente" ? "var(--muted-foreground)" : config.cor }}>
        {label} · {config.texto}
      </span>
    </>
  );

  // Só o módulo com falha é acionável — é o único caso onde há mais
  // informação por trás do selo (o motivo do erro) que vale a pena expor.
  if (status === "erro" && erro) {
    return (
      <DialogPrimitive.Root>
        <DialogPrimitive.Trigger asChild>
          <motion.button
            layout
            type="button"
            title="Ver motivo da falha"
            className="press-feedback inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition-colors hover:brightness-95"
            style={{ background: config.bg, borderColor: `color-mix(in srgb, ${config.cor} 35%, transparent)` }}
          >
            {conteudo}
          </motion.button>
        </DialogPrimitive.Trigger>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=open]:animate-in" />
          <DialogPrimitive.Content className="fixed inset-x-3 bottom-3 z-50 flex max-h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-[1.1rem] border border-border bg-card text-left shadow-[0_18px_48px_rgba(14,15,19,.24)] outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[min(28rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2">
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: tint("var(--destructive)", 12), color: "var(--destructive)" }}>
                  <XCircle size={14} />
                </span>
                <div>
                  <DialogPrimitive.Title className="text-[15px] font-bold text-foreground">{label} falhou</DialogPrimitive.Title>
                  <DialogPrimitive.Description className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                    Os demais módulos continuaram normalmente — só este precisou ser refeito.
                  </DialogPrimitive.Description>
                </div>
              </div>
              <DialogPrimitive.Close asChild>
                <button type="button" aria-label="Fechar" className="press-feedback inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                  <X size={16} />
                </button>
              </DialogPrimitive.Close>
            </div>
            <div className="px-5 py-4">
              <p className="text-[11px] font-bold uppercase tracking-[.07em] text-muted-foreground">Motivo</p>
              <p className="mt-1.5 rounded-lg border border-border bg-muted/35 px-3 py-2.5 text-[12.5px] leading-relaxed text-foreground">{erro}</p>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    );
  }

  return (
    <motion.div
      layout
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1"
      style={{ background: config.bg }}
    >
      {conteudo}
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
  const reduzir = useReducedMotion();

  return (
    <div
      className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full p-[2px] shadow-inner"
      style={{ background: `conic-gradient(${cor} ${Math.max(0, Math.min(animado, 100)) * 3.6}deg, var(--muted) 0deg)` }}
    >
      {emAndamento && !reduzir && (
        <motion.span
          aria-hidden="true"
          className="absolute inset-[-3px] rounded-full border border-primary/25"
          animate={{ scale: [1, 1.16], opacity: [0.55, 0] }}
          transition={{ duration: 1.25, repeat: Infinity, ease: "easeOut" }}
        />
      )}
      <div className="grid h-full w-full place-items-center rounded-full bg-card">
        {comErro && !emAndamento ? (
          <AlertTriangle size={13} strokeWidth={2.5} style={{ color: "var(--destructive)" }} />
        ) : (
          <span className="text-[9px] font-black tabular-nums text-foreground">{Math.round(animado)}%</span>
        )}
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
        <AnimatedInfoTrigger
          aria-label={`Explicar sincronização de ${conta.canalLabel} ${conta.brandLabel}`}
          title="O que este botão sincroniza"
          iconSize={14}
          iconStrokeWidth={2.3}
          className="press-feedback inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=open]:duration-300" />
        <DialogPrimitive.Content
          className="fixed inset-x-3 bottom-3 z-50 flex max-h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-[1.1rem] border border-border bg-card text-left shadow-[0_18px_48px_rgba(14,15,19,.24)] outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-bottom-2 data-[state=open]:duration-300 data-[state=open]:ease-[cubic-bezier(0.22,1,0.36,1)] sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[min(34rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:data-[state=open]:slide-in-from-bottom-0"
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
                  <X size={16} />
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
  const reduzir = useReducedMotion();
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
  // Quem falhou vai pra frente da fila visual — é o que precisa de ação,
  // não deveria depender de vasculhar as outras 6 pílulas verdes pra achar.
  const modulosOrdenados = comErro
    ? [...MODULOS].sort((a, b) => Number(execucao?.[b.chave] === "erro") - Number(execucao?.[a.chave] === "erro"))
    : MODULOS;
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

      {/* Colunas com largura fixa (não "auto"): cada linha é uma conta
          separada, sem grid compartilhado entre elas — só travando a
          largura de cada coluna é que "Sincronizar", o status e o relógio
          caem exatamente no mesmo x em toda linha, com ou sem alerta. */}
      <div className="flex flex-wrap items-center gap-2 xl:grid xl:grid-cols-[13rem_minmax(0,13rem)_2rem_auto] xl:items-center">
        <div className="flex min-h-9 items-center justify-start xl:justify-center">
          <AnimatePresence mode="popLayout">
            {execucao && (
              <motion.div
                key="status"
                initial={reduzir ? false : { opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduzir ? undefined : { opacity: 0 }}
              >
                <PopoverPrimitive.Root>
                  <PopoverPrimitive.Trigger asChild>
                    <button
                      type="button"
                      className="group press-feedback flex h-9 max-w-full items-center gap-1.5 rounded-full border border-border bg-card py-0 pl-1.5 pr-2 transition-colors hover:bg-muted"
                    >
                      <ProgressoCircular valor={percentual} emAndamento={emAndamento} comErro={comErro} />
                      <p className="min-w-0 pr-0.5 text-left text-[11px] font-bold leading-tight text-foreground">{statusResumo}</p>
                      <ChevronDown size={13} className="shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                    </button>
                  </PopoverPrimitive.Trigger>
                  <PopoverPrimitive.Portal>
                    <PopoverPrimitive.Content
                      align="end"
                      sideOffset={8}
                      collisionPadding={12}
                      // Flutuante de propósito: as pílulas de módulo não fazem parte
                      // do fluxo da linha — se fossem inline, abrir empurraria as
                      // outras contas pra baixo. Aqui a linha nunca muda de altura.
                      className="z-[100] w-[min(24rem,calc(100vw-1.5rem))] origin-[var(--radix-popover-content-transform-origin)] rounded-[1rem] border border-border bg-card p-3 shadow-[0_16px_40px_rgba(14,15,19,.20)] outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:duration-300 data-[state=open]:ease-[cubic-bezier(0.22,1,0.36,1)]"
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        {modulosOrdenados.map((modulo) => (
                          <SeloModulo
                            key={modulo.chave}
                            label={modulo.label}
                            status={execucao[modulo.chave] as ModuloStatus}
                            resultado={execucao[modulo.resultado]}
                            erro={execucao[modulo.erro] as string | null}
                          />
                        ))}
                      </div>
                      <PopoverPrimitive.Arrow className="fill-card" />
                    </PopoverPrimitive.Content>
                  </PopoverPrimitive.Portal>
                </PopoverPrimitive.Root>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <span className="inline-flex min-h-8 items-center gap-1.5 text-[11px] font-medium text-muted-foreground xl:justify-end xl:text-right">
          <Clock3 size={12} className="shrink-0" />
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
