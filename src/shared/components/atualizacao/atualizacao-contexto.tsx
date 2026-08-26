"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { emitirAtualizacaoLocal } from "@/shared/lib/atualizacao-local";
import { actionDispararAtualizacaoModulo } from "@/app/(dashboard)/atualizacao-actions";
import type {
  PainelAtualizacao,
  TelaAtualizavel,
} from "@/modules/canais/application/painel-atualizacao.service";
import { fontesAlteradas } from "@/modules/canais/domain/versao-fontes";
import type { ModuloSincronizacao } from "@/modules/canais/domain/sincronizacao-progresso";

/* ── Um poller, não dois ────────────────────────────────────────────────
   O toggle é montado duas vezes (cabeçalho desktop e cabeçalho mobile).
   Antes cada instância mantinha o seu próprio estado e o seu próprio
   intervalo, e a que não correspondia ao tamanho de tela abortava dentro da
   função de consulta — dois timers vivos pra um dado só. Agora a consulta
   mora aqui, uma vez, e os dois gatilhos só desenham o que este contexto
   entrega. */

const INTERVALO_ATIVO_MS = 5_000;
const INTERVALO_BASE_MS = 45_000;
const INTERVALO_MAXIMO_MS = 180_000;

type ValorContexto = {
  tela: TelaAtualizavel | null;
  painel: PainelAtualizacao | null;
  /** Primeira carga desta sessão — só aqui é honesto mostrar "consultando". */
  primeiraCarga: boolean;
  /** O painel na tela é de outra rota e ainda não foi confirmado para esta. */
  desatualizado: boolean;
  atualizandoLocal: boolean;
  contaDisparando: string | null;
  atualizarSomenteTela: () => void;
  verificarConta: (channelAccountId: string, modulo: ModuloSincronizacao) => Promise<void>;
};

const Contexto = createContext<ValorContexto | null>(null);

export function useAtualizacao(): ValorContexto {
  const valor = useContext(Contexto);
  if (!valor) throw new Error("useAtualizacao precisa do AtualizacaoProvider.");
  return valor;
}

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

export function AtualizacaoProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const tela = telaDoCaminho(pathname);

  const [painel, setPainel] = useState<PainelAtualizacao | null>(null);
  const [primeiraCarga, setPrimeiraCarga] = useState(true);
  const [contaDisparando, setContaDisparando] = useState<string | null>(null);
  const [atualizandoLocal, iniciarAtualizacaoLocal] = useTransition();

  const consultando = useRef(false);
  const versoesRef = useRef<PainelAtualizacao["versoes"] | null>(null);
  const semMudanca = useRef(0);

  const consultar = useCallback(async (motivo: "rotina" | "foco" | "manual" = "rotina") => {
    if (!tela || consultando.current) return;
    if (motivo === "rotina" && document.visibilityState === "hidden") return;
    consultando.current = true;
    try {
      const resposta = await fetch(`/api/atualizacao/${tela}`, {
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      if (!resposta.ok) throw new Error(String(resposta.status));
      const proximo = await resposta.json() as PainelAtualizacao;

      const anteriores = versoesRef.current;
      const alteradas = fontesAlteradas(anteriores, proximo.versoes);
      versoesRef.current = proximo.versoes;

      setPainel(proximo);
      setPrimeiraCarga(false);

      if (alteradas.length > 0) {
        semMudanca.current = 0;
        /* A tela relê sozinha só o que a fonte alterada afeta. O
           router.refresh() saiu daqui de propósito: ele refazia todo o
           RSC da rota em cima do recarregamento que a própria lista já
           dispara — o mesmo dado, duas vezes. */
        emitirAtualizacaoLocal(tela, proximo.versao, alteradas);
      } else if (anteriores) {
        semMudanca.current += 1;
      }
    } catch {
      /* O cabeçalho não derruba a página. Mantém o último painel bom na
         tela e tenta de novo no próximo ciclo ou ao voltar o foco. */
      semMudanca.current += 1;
    } finally {
      consultando.current = false;
    }
  }, [tela]);

  // Troca de rota: o painel anterior CONTINUA na tela até o novo chegar —
  // ele só deixa de valer para a rota atual (ver `desatualizado`, derivado
  // logo abaixo). Zerar o estado aqui era o que fazia o botão piscar
  // "consultando" a cada navegação, mesmo sem nada ter mudado.
  useEffect(() => {
    if (!tela) return;
    versoesRef.current = null;
    semMudanca.current = 0;
    const inicial = window.setTimeout(() => void consultar("manual"), 0);
    return () => window.clearTimeout(inicial);
  }, [consultar, tela]);

  const emAndamento = painel?.emAndamento ?? false;

  /* Ritmo do polling.
     Enquanto algo roda, 5s — é quando a porcentagem importa. Parado, começa
     em 45s e vai dobrando até 3 min depois de checagens seguidas sem
     novidade: numa aba esquecida aberta o dia inteiro isso é a diferença
     entre 80 e 20 consultas por hora. Voltar o foco zera o recuo e checa na
     hora, então o frescor percebido não muda.

     É um timeout que se reagenda, não um intervalo fixo: assim o recuo é
     lido no momento de agendar (dentro do callback) em vez de durante a
     renderização, e uma consulta lenta nunca se sobrepõe à seguinte. */
  useEffect(() => {
    if (!tela) return;
    let timer = 0;
    const agendar = () => {
      const espera = emAndamento
        ? INTERVALO_ATIVO_MS
        : Math.min(INTERVALO_BASE_MS * 2 ** Math.min(semMudanca.current, 2), INTERVALO_MAXIMO_MS);
      timer = window.setTimeout(() => { void consultar("rotina").then(agendar); }, espera);
    };
    agendar();

    const aoVoltar = () => {
      if (document.visibilityState !== "visible") return;
      semMudanca.current = 0;
      void consultar("foco");
    };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
  }, [consultar, emAndamento, tela]);

  const atualizarSomenteTela = useCallback(() => {
    if (!tela) return;
    iniciarAtualizacaoLocal(() => {
      emitirAtualizacaoLocal(tela, painel?.versao);
      router.refresh();
      void consultar("manual");
    });
  }, [consultar, painel?.versao, router, tela]);

  const verificarConta = useCallback(async (channelAccountId: string, modulo: ModuloSincronizacao) => {
    setContaDisparando(channelAccountId);
    try {
      await actionDispararAtualizacaoModulo({ channelAccountId, modulo });
      toast.success("Entrou na fila. Os dados atuais continuam na tela.");
      semMudanca.current = 0;
      await consultar("manual");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível iniciar a verificação.");
    } finally {
      setContaDisparando(null);
    }
  }, [consultar]);

  const valor = useMemo<ValorContexto>(() => ({
    tela,
    painel,
    primeiraCarga: primeiraCarga && painel === null,
    // Derivado, não guardado: o painel na tela é de outra rota enquanto a
    // consulta da rota nova não voltou.
    desatualizado: painel !== null && painel.tela !== tela,
    atualizandoLocal,
    contaDisparando,
    atualizarSomenteTela,
    verificarConta,
  }), [
    atualizandoLocal, atualizarSomenteTela, contaDisparando,
    painel, primeiraCarga, tela, verificarConta,
  ]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}
