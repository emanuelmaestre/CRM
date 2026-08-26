"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, Check, ChevronDown, Clock3, Database, Loader2, RefreshCw, Server, X } from "lucide-react";
import { toast } from "sonner";
import { ChannelLogo } from "@/shared/design-system/primitives/ChannelLogo";
import { emitirAtualizacaoLocal } from "@/shared/lib/atualizacao-local";
import { getBrandConfig, isBrandSlug } from "@/shared/config/brands";
import {
  actionDispararAtualizacaoModulo,
  actionObterPainelAtualizacao,
} from "@/app/(dashboard)/atualizacao-actions";
import type { TelaAtualizavel } from "@/modules/canais/application/painel-atualizacao.service";
import type { ModuloSincronizacao } from "@/modules/canais/domain/sincronizacao-progresso";

type Painel = Awaited<ReturnType<typeof actionObterPainelAtualizacao>>;

const ROTULO_MODULO: Record<ModuloSincronizacao, string> = {
  catalogo: "Catálogo e estoque",
  pedidos: "Pedidos",
  anuncios: "Anúncios",
  avaliacoes: "Avaliações",
  reputacao: "Reputação",
};

const dataHora = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});
const hora = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

function telaDoCaminho(pathname: string): TelaAtualizavel | null {
  if (pathname.startsWith("/vendas")) return "vendas";
  if (pathname.startsWith("/avaliacoes")) return "avaliacoes";
  if (pathname.startsWith("/estoque")) return "estoque";
  if (pathname.startsWith("/metricas") || pathname === "/dashboard") return "metricas";
  if (pathname.startsWith("/anuncios")) return "anuncios";
  if (pathname.startsWith("/configuracoes")) return "configuracoes";
  if (pathname.startsWith("/clientes")) return "clientes";
  if (pathname.startsWith("/importacao")) return "importacao";
  if (pathname.startsWith("/auditoria")) return "auditoria";
  return null;
}

function corStatus(status: "pendente" | "em_andamento" | "concluido" | "erro") {
  if (status === "erro") return "var(--destructive)";
  if (status === "concluido") return "var(--success)";
  if (status === "em_andamento") return "var(--info)";
  return "var(--muted-foreground)";
}

export function AtualizacaoToggle({ modo }: { modo: "desktop" | "mobile" }) {
  const pathname = usePathname();
  const router = useRouter();
  const tela = telaDoCaminho(pathname);
  const [painel, setPainel] = useState<Painel | null>(null);
  const [aberto, setAberto] = useState(false);
  const [modulo, setModulo] = useState<ModuloSincronizacao | null>(null);
  const [contaDisparando, setContaDisparando] = useState<string | null>(null);
  const [atualizandoLocal, iniciarAtualizacaoLocal] = useTransition();
  const consultando = useRef(false);
  const versaoAnterior = useRef<string | null | undefined>(undefined);

  const consultar = useCallback(async () => {
    const ehDesktop = window.matchMedia("(min-width: 768px)").matches;
    if ((modo === "desktop") !== ehDesktop) return;
    if (!tela || consultando.current || document.visibilityState === "hidden") return;
    consultando.current = true;
    try {
      const proximo = await actionObterPainelAtualizacao(tela);
      const anterior = versaoAnterior.current;
      versaoAnterior.current = proximo.versao;
      setPainel(proximo);
      setModulo((atual) => atual && proximo.modulosDisponiveis.includes(atual)
        ? atual
        : proximo.modulosDisponiveis[0] ?? null);
      if (anterior !== undefined && anterior !== proximo.versao) {
        emitirAtualizacaoLocal(tela, proximo.versao);
        router.refresh();
      }
    } catch {
      // O cabeçalho não derruba a página. A atualização manual continuará
      // disponível na próxima tentativa/retorno de foco.
    } finally {
      consultando.current = false;
    }
  }, [modo, router, tela]);

  useEffect(() => {
    versaoAnterior.current = undefined;
    if (!tela) return;
    const inicial = window.setTimeout(() => {
      setPainel(null);
      setModulo(null);
      void consultar();
    }, 0);
    return () => window.clearTimeout(inicial);
  }, [consultar, tela]);

  useEffect(() => {
    if (!tela) return;
    const intervalo = window.setInterval(() => void consultar(), painel?.emAndamento ? 5_000 : 45_000);
    const aoFoco = () => { if (document.visibilityState === "visible") void consultar(); };
    document.addEventListener("visibilitychange", aoFoco);
    window.addEventListener("focus", aoFoco);
    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", aoFoco);
      window.removeEventListener("focus", aoFoco);
    };
  }, [consultar, painel?.emAndamento, tela]);

  const temErro = useMemo(() => painel?.contas.some((conta) => (
    conta.execucao?.modulos.some((item) => item.status === "erro")
  )) ?? false, [painel]);

  if (!tela) return null;
  const telaAtual = tela;

  const carregandoPainel = painel === null;
  const progresso = painel?.progresso ?? 0;
  const emAndamento = painel?.emAndamento ?? false;
  const referencia = painel?.versao ?? painel?.ultimaConcluida ?? null;
  const cor = carregandoPainel ? "var(--muted-foreground)" : temErro ? "var(--destructive)" : emAndamento ? "var(--info)" : "var(--success)";

  function atualizarSomenteTela() {
    iniciarAtualizacaoLocal(() => {
      emitirAtualizacaoLocal(telaAtual, painel?.versao);
      router.refresh();
    });
  }

  async function verificarConta(channelAccountId: string) {
    if (!modulo) return;
    setContaDisparando(channelAccountId);
    try {
      await actionDispararAtualizacaoModulo({ channelAccountId, modulo });
      toast.success(`${ROTULO_MODULO[modulo]} entrou na fila. Os dados atuais continuam disponíveis.`);
      await consultar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível iniciar a verificação.");
    } finally {
      setContaDisparando(null);
    }
  }

  return (
    <Dialog.Root open={aberto} onOpenChange={setAberto}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label={carregandoPainel ? "Consultando atualizações locais" : emAndamento ? `Atualização em ${progresso}%` : referencia ? `Dados atualizados às ${hora.format(new Date(referencia))}` : "Abrir atualizações"}
          title={emAndamento ? `Atualizando · ${progresso}%` : referencia ? `Atualizado ${dataHora.format(new Date(referencia))}` : "Atualizações"}
          className="press-feedback inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:px-2"
        >
          <span
            className="relative grid h-7 w-7 shrink-0 place-items-center rounded-full p-[2px]"
            style={{ background: `conic-gradient(${cor} ${emAndamento ? progresso * 3.6 : 360}deg, var(--muted) 0deg)` }}
          >
            <span className="grid h-full w-full place-items-center rounded-full bg-card">
              {carregandoPainel
                ? <Loader2 size={12} className="animate-spin" style={{ color: cor }} />
                : temErro && !emAndamento
                ? <AlertTriangle size={12} style={{ color: cor }} />
                : emAndamento
                  ? <span className="text-[8px] font-black tabular-nums text-foreground">{progresso}%</span>
                  : <Check size={12} strokeWidth={2.7} style={{ color: cor }} />}
            </span>
          </span>
          <span className="hidden whitespace-nowrap lg:inline">
            {carregandoPainel ? "Consultando" : emAndamento ? `${progresso}%` : referencia ? `Atualizado ${hora.format(new Date(referencia))}` : "Atualizar"}
          </span>
          <ChevronDown size={12} className="hidden lg:block" />
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px] md:bg-black/10" />
        <Dialog.Content className="fixed inset-x-2 bottom-2 z-50 max-h-[min(42rem,calc(100dvh-1rem))] overflow-hidden rounded-[1.15rem] border border-border bg-card shadow-[0_20px_60px_rgba(0,0,0,.28)] outline-none md:inset-x-auto md:bottom-auto md:right-3 md:top-[3.75rem] md:w-[25rem]">
          <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3.5">
            <div>
              <Dialog.Title className="text-sm font-bold text-foreground">Atualizações</Dialog.Title>
              <Dialog.Description className="mt-0.5 text-[11px] text-muted-foreground">
                {carregandoPainel
                  ? "Consultando somente o banco local…"
                  : emAndamento
                  ? `Atualizando em segundo plano · ${progresso}%`
                  : referencia
                    ? `Dados locais de ${dataHora.format(new Date(referencia))}`
                    : "Nenhum dado sincronizado ainda"}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" aria-label="Fechar atualizações" className="press-feedback grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
                <X size={15} />
              </button>
            </Dialog.Close>
          </div>

          <div className="max-h-[calc(100dvh-8rem)] overflow-y-auto px-4 py-4 md:max-h-[calc(100dvh-8.5rem)]">
            <div className="flex items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Progresso da atualização" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progresso}>
                <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${progresso}%`, background: cor }} />
              </div>
              <span className="w-9 text-right text-xs font-black tabular-nums text-foreground">{progresso}%</span>
            </div>

            <button
              type="button"
              onClick={atualizarSomenteTela}
              disabled={atualizandoLocal}
              className="press-feedback mt-4 flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 text-left transition-colors hover:bg-muted disabled:opacity-60"
            >
              <span className="flex items-center gap-2.5">
                {atualizandoLocal ? <Loader2 size={15} className="animate-spin" /> : <Database size={15} />}
                <span><strong className="block text-xs text-foreground">Atualizar dados da tela</strong><small className="mt-0.5 block text-[10px] text-muted-foreground">Somente banco local · sem Webshare</small></span>
              </span>
              <RefreshCw size={13} />
            </button>

            {painel?.emAndamento && (
              <section className="mt-4" aria-label="Atividades em andamento">
                <p className="text-[10px] font-bold uppercase tracking-[.08em] text-muted-foreground">Em andamento</p>
                <div className="mt-2 space-y-2">
                  {painel.contas.flatMap((conta) => conta.execucao?.emAndamento ? conta.execucao.modulos.map((item) => (
                    <div key={`${conta.id}-${item.modulo}`} className="rounded-xl bg-muted/45 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="min-w-0 truncate font-semibold text-foreground">{item.label} · {conta.brandLabel}</span>
                        <span className="shrink-0 font-black tabular-nums" style={{ color: corStatus(item.status) }}>{item.progresso}%</span>
                      </div>
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-background">
                        <div className="h-full rounded-full" style={{ width: `${item.progresso}%`, background: corStatus(item.status) }} />
                      </div>
                    </div>
                  )) : [])}
                </div>
              </section>
            )}

            {painel?.podeSincronizar && painel.modulosDisponiveis.length > 0 && (
              <section className="mt-4 border-t border-border pt-4">
                <div className="flex items-center gap-2">
                  <Server size={13} className="text-muted-foreground" />
                  <p className="text-[10px] font-bold uppercase tracking-[.08em] text-muted-foreground">Verificar canal agora</p>
                </div>
                <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">Ação explícita e incremental. Shopee pode utilizar Webshare.</p>

                {painel.modulosDisponiveis.length > 1 && (
                  <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                    {painel.modulosDisponiveis.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setModulo(item)}
                        aria-pressed={modulo === item}
                        className="press-feedback min-h-9 shrink-0 rounded-full border border-border px-3 text-[10px] font-bold text-muted-foreground transition-colors aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
                      >
                        {ROTULO_MODULO[item]}
                      </button>
                    ))}
                  </div>
                )}

                <div className="mt-2 space-y-2">
                  {painel.contas.filter((conta) => modulo && conta.modulosDisponiveis.includes(modulo)).map((conta) => {
                    const corMarca = isBrandSlug(conta.brandSlug) ? getBrandConfig(conta.brandSlug)?.color : undefined;
                    const ocupada = conta.execucao?.emAndamento ?? false;
                    return (
                      <div key={conta.id} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2.5">
                        <ChannelLogo canal={conta.canal} size="sm" variant="badge" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-foreground">{conta.canalLabel}</p>
                          <p className="truncate text-[10px]" style={{ color: corMarca }}>{conta.brandLabel}</p>
                        </div>
                        <button
                          type="button"
                          disabled={ocupada || contaDisparando === conta.id || !modulo}
                          onClick={() => void verificarConta(conta.id)}
                          className="press-feedback inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[10px] font-bold text-foreground hover:bg-muted disabled:opacity-50"
                        >
                          {ocupada || contaDisparando === conta.id ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                          {ocupada ? `${conta.execucao?.progresso ?? 0}%` : "Verificar"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {temErro && (
              <div className="mt-4 flex gap-2 rounded-xl bg-destructive/10 px-3 py-2.5 text-[11px] text-destructive">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <p>Uma fonte falhou. Os últimos dados confirmados continuam visíveis; abra Configurações para ver o motivo completo.</p>
              </div>
            )}

            <p className="mt-4 flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Clock3 size={11} /> Abrir páginas e trocar filtros nunca inicia chamadas externas.
            </p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
