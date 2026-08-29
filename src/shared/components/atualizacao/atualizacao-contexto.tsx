"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CloudOff, Loader2, RotateCw, X } from "lucide-react";
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

/** "Mercado Livre e Shopee" — nomes de canal do jeito que se fala. */
function listarCanais(canais: string[]): string {
  if (canais.length <= 1) return canais[0] ?? "";
  return `${canais.slice(0, -1).join(", ")} e ${canais.at(-1)}`;
}

function relogioRegressivo(segundos: number): string {
  return `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, "0")}`;
}

const faltamSegundos = (ate: number) => Math.max(0, Math.ceil((ate - Date.now()) / 1000));

/** Conta até o instante em que uma nova tentativa passa a valer a pena.
 *
 *  O que falta é sempre calculado do relógio na hora de desenhar — o efeito
 *  só bate o segundo. Guardar o número em estado obrigaria a ressincronizá-lo
 *  a cada resposta do servidor, e uma aba que ficou em segundo plano voltaria
 *  exibindo o valor de quando saiu. */
function useEsperaRestante(liberadoEm: number): number {
  const [, bater] = useState(0);

  useEffect(() => {
    if (liberadoEm <= Date.now()) return;
    const relogio = window.setInterval(() => {
      bater((valor) => valor + 1);
      if (faltamSegundos(liberadoEm) === 0) window.clearInterval(relogio);
    }, 1_000);
    return () => window.clearInterval(relogio);
  }, [liberadoEm]);

  return faltamSegundos(liberadoEm);
}

/** Tarja de dado não confirmado.
 *
 *  Substitui o apagão que existia aqui. Esconder a tela inteira porque um
 *  canal não respondeu deixava o CRM inutilizável — inclusive a parte que
 *  estava perfeita no banco e os dados do outro canal — e o "Tentar
 *  novamente" caía no intervalo mínimo entre verificações e voltava a
 *  falhar. Dado antigo com a hora dele estampada não é dado apresentado como
 *  atual; tela vazia é operação parada.
 *
 *  Três decisões de lugar e de comportamento, todas nascidas de ver a tarja
 *  em uso:
 *
 *  1. Mora no RODAPÉ. No topo ela cobria a faixa de filtros — as marcas e o
 *     seletor de período de Métricas ficavam embaixo dela — e o aviso de que
 *     o dado é velho impedia justamente de trocar o recorte do dado.
 *  2. Diz QUEM não respondeu. "Não foi possível confirmar" não informa se o
 *     problema é geral ou de um canal só; com o nome, quem lê já sabe qual
 *     metade da tela está velha.
 *  3. O botão sabe quando não adianta. O servidor recusa nova verificação
 *     dentro do intervalo mínimo, então clicar antes disso só devolve o mesmo
 *     erro. Enquanto a espera corre, o botão mostra o relógio em vez de
 *     prometer o que não entrega. */
function TarjaNaoConfirmado({
  carimbo,
  canais,
  liberadoEm,
  ocupado,
  tentarNovamente,
  dispensar,
}: {
  carimbo: string | null;
  canais: string[];
  liberadoEm: number;
  ocupado: boolean;
  tentarNovamente: () => void;
  dispensar: () => void;
}) {
  const reduzir = useReducedMotion() ?? false;
  const espera = useEsperaRestante(liberadoEm);
  const esperando = espera > 0;

  const motivo = canais.length > 0
    ? `${listarCanais(canais)} ${canais.length > 1 ? "não responderam" : "não respondeu"}.`
    : "Os canais não responderam agora.";

  return (
    <motion.div
      /* Acima do conteúdo, ao lado das barras de navegação (z-30) — nunca por
         cima delas: no celular a tarja fica logo em cima da barra inferior, e
         cobrir os ícones para avisar de dado velho seria trocar um problema
         por outro. */
      className="material-thick fixed inset-x-3 bottom-[calc(var(--bottom-nav-h,64px)_+_env(safe-area-inset-bottom)_+_0.75rem)] z-30 mx-auto flex w-fit max-w-[min(100%,34rem)] flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl px-3.5 py-2.5 md:bottom-6"
      initial={reduzir ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduzir ? { opacity: 0 } : { opacity: 0, y: 14 }}
      transition={{ duration: reduzir ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }}
      aria-busy={ocupado || undefined}
    >
      <span className="shrink-0" aria-hidden>
        {ocupado
          ? <Loader2 size={17} className="animate-spin text-muted-foreground" />
          : <CloudOff size={17} className="text-amber-500" />}
      </span>

      {/* Só o texto é região viva: com o botão dentro, o leitor de tela
          reanunciaria a tarja inteira a cada segundo do relógio regressivo. */}
      <div role="status" aria-live="polite" className="min-w-[11rem] flex-1">
        <p className="text-[0.8125rem] font-semibold leading-snug text-foreground">
          {ocupado
            ? "Confirmando com os canais…"
            : carimbo
              ? <>Mostrando os dados de <span className="tabular-nums">{carimbo}</span></>
              : "Dados sem confirmação agora"}
        </p>
        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
          {ocupado
            ? carimbo ? `Os dados de ${carimbo} seguem na tela.` : "Os dados atuais seguem na tela."
            : motivo}
        </p>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        {!ocupado && (
          <button
            type="button"
            onClick={tentarNovamente}
            disabled={esperando}
            title={esperando
              ? `Os canais foram consultados há pouco. Nova tentativa em ${relogioRegressivo(espera)}.`
              : undefined}
            className="press-feedback inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-55"
          >
            <RotateCw size={13} aria-hidden />
            {esperando
              ? <span className="tabular-nums">Em {relogioRegressivo(espera)}</span>
              : "Tentar novamente"}
          </button>
        )}
        <button
          type="button"
          onClick={dispensar}
          aria-label="Dispensar o aviso"
          className="press-feedback rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X size={15} aria-hidden />
        </button>
      </div>
    </motion.div>
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
  /* Estado da tarja: o clique em "Tentar novamente" acontece DENTRO dela, sem
     nunca voltar a cobrir a tela. */
  const [reconfirmando, setReconfirmando] = useState(false);
  const [dispensada, setDispensada] = useState(false);
  const [liberadoEm, setLiberadoEm] = useState(0);
  const retomadaSilenciosa = useRef(false);
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

  /* Retentar NÃO é reentrar na tela.
     Antes este botão zerava a entrada e a cobertura em tela cheia voltava por
     cima de tudo — quem clicava perdia a tela que estava lendo para esperar de
     novo o mesmo canal que acabara de falhar. Agora a confirmação corre por
     baixo: o conteúdo continua no lugar, a tarja vira "confirmando…" e só sai
     quando o dado é de fato confirmado. */
  const tentarNovamente = useCallback(() => {
    retomadaSilenciosa.current = true;
    setReconfirmando(true);
    setTentativa((valor) => valor + 1);
  }, []);

  useEffect(() => {
    if (!tela) return;
    const controlador = new AbortController();
    let timer = 0;
    let ativo = true;
    let ultimoFoco = 0;
    let disparos = 0;
    const silenciosa = retomadaSilenciosa.current;
    retomadaSilenciosa.current = false;
    /* Dispensado só na primeira tela da sessão que veio do login. A partir da
       segunda o portão volta a valer normalmente. Numa retomada silenciosa o
       portão também não entra: a tela já está aberta e assim continua. */
    let resolvida = portaoDispensado.current || silenciosa;
    portaoDispensado.current = false;
    let aguardandoConclusao = false;
    /* Zerado a cada troca de tela. Sem isto, o mapa de versões de Vendas (só
       "pedidos") era comparado com o de Métricas (cinco fontes), as quatro
       fontes novas apareciam como "mudaram" e cada navegação entre módulos
       disparava um router.refresh() supérfluo — a página inteira de Métricas
       renderizando de novo no servidor logo depois de já ter renderizado.
       A retomada silenciosa preserva o mapa de propósito: é a comparação com
       ele que faz a tela reler o banco quando a confirmação enfim vem. */
    if (!silenciosa) {
      versoes.current = null;
      setDispensada(false);
    }

    const resolver = () => {
      if (resolvida) return;
      resolvida = true;
      setEntradaResolvida(true);
    };

    /* Teto do bloqueio: passou disto, o conteúdo aparece com a tarja. O mesmo
       teto encerra o giro do "confirmando…" — o poll continua, mas a tarja
       volta a devolver a decisão a quem está olhando, em vez de girar sem
       prazo. */
    const relogioLimite = window.setTimeout(() => {
      if (!ativo) return;
      setReconfirmando(false);
      if (resolvida) return;
      setFalhou(true);
      resolver();
    }, LIMITE_BLOQUEIO_MS);

    const falhar = () => {
      if (!ativo) return;
      setFalhou(true);
      setReconfirmando(false);
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
      /* Instante em que o servidor volta a aceitar uma verificação. É ele que
         vira o relógio no botão da tarja. */
      setLiberadoEm(proximo.esperarSegundos ? Date.now() + proximo.esperarSegundos * 1_000 : 0);

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
        setFalhou(true);
        setReconfirmando(false);
        resolver();
        agendar(POLLING_PRONTO_MS);
        return;
      }

      if (proximo.situacao === "erro") {
        setFalhou(true);
        setReconfirmando(false);
        resolver();
        agendar(POLLING_PRONTO_MS);
        return;
      }

      setFalhou(false);
      setReconfirmando(false);
      /* Confirmou: a dispensa anterior morre com o problema que ela escondia.
         Sem isto, uma falha nova depois desta ficaria muda até trocar de
         tela. */
      setDispensada(false);
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
  /* "Ocupado" cobre os dois jeitos de estar trabalhando: o clique que ainda
     não voltou do servidor e a sincronização que o próprio servidor confirma
     estar rodando. Nos dois casos, oferecer "Tentar novamente" seria convidar
     a empilhar pedido em cima de pedido. */
  const ocupado = reconfirmando || estado?.situacao === "atualizando";

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
      <AnimatePresence>
        {!bloqueado && falhou && !dispensada && (
          <TarjaNaoConfirmado
            key="tarja"
            carimbo={rotularCarimbo(estado?.confirmadoAte ?? estado?.versao)}
            canais={estado?.canais ?? []}
            liberadoEm={liberadoEm}
            ocupado={ocupado}
            tentarNovamente={tentarNovamente}
            dispensar={() => setDispensada(true)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
