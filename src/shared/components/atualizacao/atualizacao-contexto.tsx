"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { BloqueioAtualizacao } from "./bloqueio-atualizacao";
import { entradaVeioDoLogin, limparEntradaPosLogin } from "@/shared/lib/auth/entrada-pos-login";
import { emitirAtualizacaoLocal } from "@/shared/lib/atualizacao-local";
import { fontesAlteradas, type VersoesPorFonte } from "@/modules/canais/domain/versao-fontes";
import type { EstadoAtualizacaoTela } from "@/modules/canais/application/atualizacao-inteligente.service";
import type { TelaAtualizavel } from "@/modules/canais/application/painel-atualizacao.service";

const POLLING_ATIVO_MS = 3_000;
const POLLING_PRONTO_MS = 60_000;

/** Teto do bloqueio de entrada.
 *
 *  Passado disto o operador para de esperar e passa a trabalhar com o dado
 *  que existe, sempre rotulado com a hora dele. Segurar mais que isso não
 *  torna o número mais verdadeiro — só transfere para a pessoa o custo de um
 *  canal lento, e a queixa que originou toda esta mudança era exatamente a
 *  tela que demorava demais para aparecer. */
const LIMITE_BLOQUEIO_MS = 20_000;

/** Quantas vezes a entrada pode mandar confirmar antes de desistir e liberar
 *  a tela. Existe contra o laço: um POST que volta "pendente" mandaria outro
 *  POST na mesma hora, e cada um deles dispara fila de sincronização. */
const MAXIMO_DISPAROS_POR_ENTRADA = 2;

/** Duas idas ao servidor em sequência quando a aba volta ao foco não trazem
 *  nada de novo — só invocação na Vercel. */
const DEBOUNCE_FOCO_MS = 2_000;

function telaDoCaminho(pathname: string): TelaAtualizavel | null {
  if (pathname.startsWith("/vendas")) return "vendas";
  if (pathname.startsWith("/avaliacoes")) return "avaliacoes";
  if (pathname.startsWith("/estoque")) return "estoque";
  if (pathname.startsWith("/metricas") || pathname === "/dashboard") return "metricas";
  if (pathname.startsWith("/anuncios") || pathname.startsWith("/publicidade")) return "anuncios";
  if (pathname.startsWith("/clientes")) return "clientes";
  return null;
}

/** "10h32" — a hora do dado que ficou na tela. Com a data junto quando não é
 *  de hoje, senão o "10h32" de anteontem passaria por recente. */
function rotularCarimbo(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return null;
  const fuso = "America/Sao_Paulo";
  const hora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: fuso })
    .format(data).replace(":", "h");
  const dia = new Intl.DateTimeFormat("pt-BR", { timeZone: fuso }).format(data);
  const hoje = new Intl.DateTimeFormat("pt-BR", { timeZone: fuso }).format(new Date());
  return dia === hoje ? hora : `${dia} ${hora}`;
}

/** Tarja de dado não confirmado.
 *
 *  Substitui o apagão que existia aqui. Esconder a tela inteira porque um
 *  canal não respondeu deixava o CRM inutilizável — inclusive a parte que
 *  estava perfeita no banco e os dados do outro canal — e o "Tentar
 *  novamente" caía no intervalo mínimo entre verificações e voltava a
 *  falhar. Dado antigo com a hora dele estampada não é dado apresentado como
 *  atual; tela vazia é operação parada. */
function TarjaNaoConfirmado({
  carimbo,
  tentarNovamente,
}: {
  carimbo: string | null;
  tentarNovamente: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-[calc(3.75rem_+_env(safe-area-inset-top))] z-20 mx-auto flex w-fit max-w-[min(94vw,42rem)] items-center gap-3 rounded-full border border-border bg-card/95 px-4 py-2 shadow-lg backdrop-blur-md md:top-16"
    >
      <span className="size-2 shrink-0 rounded-full bg-amber-500" aria-hidden />
      <p className="text-xs font-medium text-muted-foreground">
        {carimbo
          ? <>Dados de <strong className="font-semibold text-foreground">{carimbo}</strong>. Não foi possível confirmar agora.</>
          : "Não foi possível confirmar os dados agora."}
      </p>
      <button
        type="button"
        onClick={tentarNovamente}
        className="press-feedback shrink-0 rounded-full border border-border px-3 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
      >
        Tentar novamente
      </button>
    </div>
  );
}

/** Portão de entrada: o conteúdo só é revelado depois da confirmação — e,
 *  quando a confirmação não vem, é revelado assim mesmo, com a hora do dado.
 *
 *  Confirmar é coisa da ENTRADA. Depois que a tela abriu, o mesmo relógio
 *  continua rodando, só que como leitura: pedido novo chega por webhook, a
 *  versão da fonte muda e a tela relê o banco sozinha. Voltar a disparar
 *  sincronização a cada volta do relógio transformaria uma tela aberta a
 *  tarde inteira em uma sincronização a cada cinco minutos — a conta que
 *  esta mudança existe para não pagar. */
export function AtualizacaoProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const tela = telaDoCaminho(pathname);
  const [estado, setEstado] = useState<EstadoAtualizacaoTela | null>(null);
  const [falhou, setFalhou] = useState(false);
  /* Ver entrada-pos-login: logo depois da senha, confirmar em tela cheia é
     lido como "o login travou". A confirmação continua rodando — só não
     cobra pedágio nessa primeira tela. */
  const [semPortaoNaEntrada] = useState(entradaVeioDoLogin);
  const [entradaResolvida, setEntradaResolvida] = useState(semPortaoNaEntrada);
  const portaoDispensado = useRef(semPortaoNaEntrada);
  const [tentativa, setTentativa] = useState(0);
  const [geracao, setGeracao] = useState(0);
  const [refrescando, iniciarRefresco] = useTransition();
  const versoes = useRef<VersoesPorFonte | null>(null);

  useEffect(() => { limparEntradaPosLogin(); }, []);

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
    setEntradaResolvida(false);
    setEstado(null);
    setTentativa((valor) => valor + 1);
  }, []);

  useEffect(() => {
    if (!tela) return;
    const controlador = new AbortController();
    let timer = 0;
    let ativo = true;
    let ultimoFoco = 0;
    let disparos = 0;
    /* Dispensado só na primeira tela da sessão que veio do login. A partir da
       segunda o portão volta a valer normalmente. */
    let resolvida = portaoDispensado.current;
    portaoDispensado.current = false;
    let aguardandoConclusao = false;
    /* Zerado a cada troca de tela. Sem isto, o mapa de versões de Vendas (só
       "pedidos") era comparado com o de Métricas (cinco fontes), as quatro
       fontes novas apareciam como "mudaram" e cada navegação entre módulos
       disparava um router.refresh() supérfluo — a página inteira de Métricas
       renderizando de novo no servidor logo depois de já ter renderizado. */
    versoes.current = null;

    const resolver = () => {
      if (resolvida) return;
      resolvida = true;
      setEntradaResolvida(true);
    };

    // Teto do bloqueio: passou disto, o conteúdo aparece com a tarja.
    const relogioLimite = window.setTimeout(() => {
      if (!ativo || resolvida) return;
      setFalhou(true);
      resolver();
    }, LIMITE_BLOQUEIO_MS);

    const falhar = () => {
      if (!ativo) return;
      setFalhou(true);
      resolver();
    };

    const agendar = (atraso: number) => {
      timer = window.setTimeout(() => {
        if (document.visibilityState !== "visible") return;
        void consultar(false, controlador.signal).then(aplicar).catch(() => undefined);
      }, atraso);
    };

    const aplicar = (proximo: EstadoAtualizacaoTela | null) => {
      if (!ativo || !proximo) return;
      const alteradas = fontesAlteradas(versoes.current, proximo.versoes);
      versoes.current = proximo.versoes;
      setEstado(proximo);

      if (proximo.situacao === "atualizando") {
        if (!resolvida) aguardandoConclusao = true;
        agendar(POLLING_ATIVO_MS);
        return;
      }

      if (proximo.situacao === "pendente") {
        /* Só a ENTRADA manda confirmar. Depois dela, "vencido" é assunto das
           rotinas de fundo; aqui o relógio serve de leitura, não de gatilho. */
        if (!resolvida && disparos < MAXIMO_DISPAROS_POR_ENTRADA) {
          disparos += 1;
          aguardandoConclusao = true;
          void consultar(true, controlador.signal).then(aplicar).catch(falhar);
          return;
        }
        if (!resolvida) { setFalhou(true); resolver(); }
        agendar(POLLING_PRONTO_MS);
        return;
      }

      if (proximo.situacao === "erro") {
        setFalhou(true);
        resolver();
        agendar(POLLING_PRONTO_MS);
        return;
      }

      setFalhou(false);
      if (aguardandoConclusao) {
        aguardandoConclusao = false;
        /* O conteúdo sob a cobertura nasceu antes da confirmação. Antes isto
           era um window.location.reload(): documento inteiro de novo, e o
           page.tsx pesado renderizando duas vezes por entrada. router.refresh()
           refaz só a árvore de servidor, e a troca de `geracao` remonta os
           componentes de cliente para que nada do render antigo sobreviva. A
           cobertura só sai quando a transição termina. */
        iniciarRefresco(() => {
          router.refresh();
          setGeracao((valor) => valor + 1);
        });
      } else if (alteradas.length > 0) {
        emitirAtualizacaoLocal(tela, proximo.versao, alteradas);
        router.refresh();
      }
      resolver();
      agendar(POLLING_PRONTO_MS);
    };

    disparos += 1;
    void consultar(true, controlador.signal).then(aplicar).catch(falhar);

    const aoVoltar = () => {
      if (document.visibilityState !== "visible" || !ativo) return;
      const agora = Date.now();
      if (agora - ultimoFoco < DEBOUNCE_FOCO_MS) return;
      ultimoFoco = agora;
      window.clearTimeout(timer);
      void consultar(false, controlador.signal).then(aplicar).catch(() => undefined);
    };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);

    return () => {
      ativo = false;
      controlador.abort();
      window.clearTimeout(timer);
      window.clearTimeout(relogioLimite);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
  }, [consultar, pathname, router, tela, tentativa]);

  if (!tela) return children;

  const bloqueado = !entradaResolvida || refrescando;

  return (
    <>
      <div className="contents" key={geracao} aria-hidden={bloqueado} inert={bloqueado ? true : undefined}>
        {children}
      </div>
      {/* AnimatePresence para que a cobertura saia levando a contagem até 100
          em vez de sumir no número em que estava. */}
      <AnimatePresence>
        {bloqueado && (
          <BloqueioAtualizacao key="bloqueio" progresso={estado?.progresso ?? 0} tela={tela} />
        )}
      </AnimatePresence>
      {!bloqueado && falhou && (
        <TarjaNaoConfirmado
          carimbo={rotularCarimbo(estado?.confirmadoAte ?? estado?.versao)}
          tentarNovamente={tentarNovamente}
        />
      )}
    </>
  );
}
