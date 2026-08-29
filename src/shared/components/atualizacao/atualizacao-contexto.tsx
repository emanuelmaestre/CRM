"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { emitirAtualizacaoLocal } from "@/shared/lib/atualizacao-local";
import { fontesAlteradas, type VersoesPorFonte } from "@/modules/canais/domain/versao-fontes";
import type { EstadoAtualizacaoTela } from "@/modules/canais/application/atualizacao-inteligente.service";
import type { TelaAtualizavel } from "@/modules/canais/application/painel-atualizacao.service";

const POLLING_ATIVO_MS = 3_000;
const POLLING_PRONTO_MS = 60_000;

function telaDoCaminho(pathname: string): TelaAtualizavel | null {
  if (pathname.startsWith("/vendas")) return "vendas";
  if (pathname.startsWith("/avaliacoes")) return "avaliacoes";
  if (pathname.startsWith("/estoque")) return "estoque";
  if (pathname.startsWith("/metricas") || pathname === "/dashboard") return "metricas";
  if (pathname.startsWith("/anuncios") || pathname.startsWith("/publicidade")) return "anuncios";
  if (pathname.startsWith("/clientes")) return "clientes";
  return null;
}

function NumeroPercentual({ valor }: { valor: number }) {
  const reduzir = useReducedMotion();
  return (
    <motion.span
      key={valor}
      initial={reduzir ? false : { opacity: 0.45, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduzir ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="text-[clamp(2.75rem,8vw,5.5rem)] font-black tabular-nums tracking-[-0.06em] text-foreground"
    >
      {Math.round(valor)}<span className="ml-1 text-[0.42em] text-muted-foreground">%</span>
    </motion.span>
  );
}
function BloqueioAtualizacao({
  progresso,
  falhou,
  tentarNovamente,
}: {
  progresso: number;
  falhou: boolean;
  tentarNovamente: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-20 grid place-items-center bg-background px-6 pt-[calc(3.5rem_+_env(safe-area-inset-top))] md:pt-14"
      role="status"
      aria-live="polite"
      aria-label={falhou ? "Não foi possível atualizar agora" : `Atualização em ${progresso} por cento`}
    >
      {falhou ? (
        <div className="flex max-w-sm flex-col items-center text-center">
          <p className="text-sm font-semibold text-foreground">Não foi possível atualizar agora.</p>
          <button
            type="button"
            onClick={tentarNovamente}
            className="press-feedback mt-4 inline-flex h-10 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
          >
            Tentar novamente
          </button>
        </div>
      ) : (
        <NumeroPercentual valor={progresso} />
      )}
    </div>
  );
}

/** Portão de entrada: o conteúdo só é revelado depois da confirmação. */
export function AtualizacaoProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const tela = telaDoCaminho(pathname);
  const [estado, setEstado] = useState<EstadoAtualizacaoTela | null>(null);
  const [falhou, setFalhou] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const versoes = useRef<VersoesPorFonte | null>(null);
  const recarregarAoConcluir = useRef(false);

  const consultar = useCallback(async (iniciar: boolean, signal?: AbortSignal) => {
    if (!tela) return null;
    const resposta = await fetch(`/api/atualizacao/${tela}`, {
      method: iniciar ? "POST" : "GET",
      cache: "no-store",
      headers: { accept: "application/json" },
      signal,
    });
    if (!resposta.ok) throw new Error(String(resposta.status));
    return await resposta.json() as EstadoAtualizacaoTela;
  }, [tela]);

  const tentarNovamente = useCallback(() => {
    setFalhou(false);
    setEstado(null);
    setTentativa((valor) => valor + 1);
  }, []);

  useEffect(() => {
    if (!tela) return;
    const controlador = new AbortController();
    let timer = 0;
    let ativo = true;
    recarregarAoConcluir.current = false;

    const falhar = () => { if (ativo) setFalhou(true); };

    const aplicar = (proximo: EstadoAtualizacaoTela | null) => {
      if (!ativo || !proximo) return;
      const alteradas = fontesAlteradas(versoes.current, proximo.versoes);
      versoes.current = proximo.versoes;
      setEstado(proximo);

      if (proximo.situacao === "erro") {
        setFalhou(true);
        return;
      }

      if (proximo.situacao === "pendente") {
        recarregarAoConcluir.current = true;
        void consultar(true, controlador.signal).then(aplicar).catch(falhar);
        return;
      }

      if (proximo.situacao === "atualizando") {
        recarregarAoConcluir.current = true;
        timer = window.setTimeout(() => {
          void consultar(false, controlador.signal).then(aplicar).catch(falhar);
        }, POLLING_ATIVO_MS);
        return;
      }

      if (alteradas.length > 0) {
        emitirAtualizacaoLocal(tela, proximo.versao, alteradas);
        router.refresh();
      }

      if (recarregarAoConcluir.current) {
        // O conteúdo sob a cobertura nasceu antes da confirmação. Recarregar
        // uma vez faz Server Components e estados cliente nascerem do banco
        // já atualizado, sem revelar o snapshot anterior.
        window.location.reload();
        return;
      }

      timer = window.setTimeout(() => {
        if (document.visibilityState === "visible") {
          void consultar(false, controlador.signal).then(aplicar).catch(() => undefined);
        }
      }, POLLING_PRONTO_MS);
    };

    void consultar(true, controlador.signal).then(aplicar).catch(falhar);

    const aoVoltar = () => {
      if (document.visibilityState !== "visible" || !ativo) return;
      window.clearTimeout(timer);
      void consultar(false, controlador.signal).then(aplicar).catch(() => undefined);
    };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);

    return () => {
      ativo = false;
      controlador.abort();
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
  }, [consultar, pathname, router, tela, tentativa]);

  if (!tela) return children;
  const pronto = estado?.situacao === "pronto" && !falhou;

  return (
    <>
      <div className="contents" aria-hidden={!pronto} inert={!pronto ? true : undefined}>
        {children}
      </div>
      {!pronto && (
        <BloqueioAtualizacao
          progresso={estado?.progresso ?? 0}
          falhou={falhou}
          tentarNovamente={tentarNovamente}
        />
      )}
    </>
  );
}
