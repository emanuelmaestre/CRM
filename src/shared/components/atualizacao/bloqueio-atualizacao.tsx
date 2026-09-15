"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useIsPresent, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";
import { casasDe, deslocamentoDaRoda, proximoValor } from "./contagem";
import { ChannelLogo } from "@/shared/design-system/primitives/ChannelLogo";
import type { TelaAtualizavel } from "@/modules/canais/application/painel-atualizacao.service";
import type { ProgressoCanal } from "@/modules/canais/application/atualizacao-inteligente.service";

/* ── A contagem ──────────────────────────────────────────────────────────
 *
 *  O servidor reporta saltos: 0, depois 40, depois 99, depois 100. Pintar o
 *  salto cru na tela não comunica progresso — comunica sobressalto. O número
 *  pisca de um valor a outro e quem olha não tem como saber se andou muito,
 *  pouco, ou se travou.
 *
 *  Aqui o valor exibido persegue o alvo passando por TODOS os inteiros do
 *  caminho, em ordem, sem pular nenhum. A aritmética disso está em
 *  `contagem.ts`, onde dá para simular a corrida inteira num teste; aqui fica
 *  só o relógio.
 *
 *  E nunca anda para trás: o servidor pode reportar 40 depois de 55 quando
 *  uma conta nova entra na conta do progresso, e regredir na tela leria como
 *  defeito. */
function useContagemCrescente(alvo: number, concluindo: boolean, congelar = false): number {
  const [valor, setValor] = useState(0);
  const valorRef = useRef(0);
  const alvoRef = useRef(0);
  const concluindoRef = useRef(concluindo);

  /* Trava de monotonicidade: o alvo só sobe. O servidor pode reportar 40
     depois de 55 — acontece quando uma conta nova entra no cálculo — e
     regredir na tela leria como defeito. O laço de quadros lê estes refs, e
     um quadro de atraso até a próxima leitura não se percebe. */
  useEffect(() => {
    // Congelado (saída por falha): o número para onde está, sem fechar a conta.
    alvoRef.current = congelar
      ? Math.min(Math.ceil(valorRef.current), alvoRef.current)
      : Math.max(alvoRef.current, concluindo ? 100 : alvo);
    concluindoRef.current = concluindo;
  }, [alvo, concluindo, congelar]);

  useEffect(() => {
    let quadro = 0;
    let anterior = performance.now();
    const passo = (agora: number) => {
      // Teto no delta: aba em segundo plano acumula segundos e voltaria com
      // um salto de 40 números de uma vez, que é o que estamos evitando.
      const delta = Math.min(agora - anterior, 64);
      anterior = agora;
      if (alvoRef.current - valorRef.current > 0.0005) {
        valorRef.current = proximoValor(
          valorRef.current, alvoRef.current, delta, concluindoRef.current,
        );
        setValor(valorRef.current);
      }
      quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, []);

  return valor;
}

/* ── O odômetro ──────────────────────────────────────────────────────────
 *
 *  Cada casa é uma tira 0…9 correndo atrás de uma janela de 1em. A tira
 *  termina com um "0" repetido para que a virada 9→0 role para a frente em
 *  vez de rebobinar dez casas para trás.
 *
 *  Só a roda das unidades gira o tempo todo. As de cima ficam paradas e só
 *  acompanham na virada — é o que um odômetro mecânico faz, e é o que evita a
 *  dezena viver borrada entre dois algarismos enquanto a unidade corre. */
const TIRA = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

function Roda({ valor, posicao }: { valor: number; posicao: number }) {
  const deslocamento = deslocamentoDaRoda(valor, posicao);

  return (
    <span className="relative block h-[1em] w-[0.62em] overflow-hidden">
      <span
        className="absolute inset-x-0 top-0 flex flex-col items-center will-change-transform"
        style={{ transform: `translate3d(0, -${deslocamento}em, 0)` }}
      >
        {TIRA.map((digito, indice) => (
          <span key={indice} className="block h-[1em] leading-none">{digito}</span>
        ))}
      </span>
    </span>
  );
}

function Odometro({ valor }: { valor: number }) {
  const casas = casasDe(valor);
  return (
    <span className="flex items-baseline" aria-hidden>
      {Array.from({ length: casas }, (_, indice) => (
        <Roda key={casas - indice} valor={valor} posicao={casas - 1 - indice} />
      ))}
      <span className="ml-[0.06em] text-[0.34em] font-bold text-muted-foreground">%</span>
    </span>
  );
}

/* ── As fichas dos canais ────────────────────────────────────────────────
 *
 *  O número diz quanto falta; as fichas dizem QUEM falta. Um canal que já
 *  respondeu acende com a borda verde e um salto curto; o que ainda está
 *  sendo aguardado fica apagado e respira — é o que separa "parado porque
 *  acabou" de "parado esperando o TikTok". */
function FichasCanais({ canais, atrasados, emFinal, tudoPronto, reduzir }: {
  canais: ProgressoCanal[];
  emFinal: boolean;
  /** Quem ainda não tinha respondido quando o final começou, em ordem. */
  atrasados: string[];
  /** Só vale quando a confirmação deu certo. Numa saída por falha as fichas
   *  continuam como estavam: acender o canal que não respondeu seria mentir. */
  tudoPronto: boolean;
  reduzir: boolean;
}) {
  if (canais.length === 0) return null;

  return (
    <ul className="mt-6 flex items-center gap-3" aria-label="Canais">
      {canais.map((item) => {
        const jaEstava = !atrasados.includes(item.label);
        /* No final a lista que chega do servidor já vem toda em 100 e
           acenderia tudo de uma vez, antes do número chegar. Quem manda a
           partir daí é a foto de quem faltava. */
        const pronto = emFinal ? tudoPronto || jaEstava : item.progresso >= 100;
        /* No final, quem ainda estava apagado acende um de cada vez — ver os
           selos chegando é o que diz "carregou tudo". A vez conta só entre os
           atrasados: sem isso o primeiro já aceso abria um buraco na fila. */
        const vez = atrasados.indexOf(item.label);
        const atraso = tudoPronto && !jaEstava && !reduzir ? MS_ENTRE_FICHAS / 1000 * (vez + 1) : 0;
        return (
          <motion.li
            key={item.canal}
            title={`${item.label}: ${pronto ? "confirmado" : "aguardando"}`}
            className={`relative grid size-11 place-items-center rounded-full border bg-white transition-colors duration-300 ${
              pronto ? "border-emerald-500" : "border-border"
            }`}
            initial={false}
            animate={reduzir
              ? { opacity: pronto ? 1 : 0.4 }
              : pronto
                ? { opacity: 1, scale: [0.9, 1.14, 1] }
                : { opacity: [0.35, 0.6, 0.35], scale: 0.9 }}
            transition={pronto || reduzir
              ? { duration: 0.45, ease: [0.3, 1.6, 0.5, 1], delay: atraso }
              : { duration: 1.9, repeat: Infinity, ease: "easeInOut" }}
          >
            <ChannelLogo canal={item.canal} size="sm" variant="logo" />
            {pronto && (
              <motion.span
                className="absolute -right-0.5 -top-0.5 grid size-4 place-items-center rounded-full bg-emerald-500 text-white"
                initial={reduzir ? false : { scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.3, ease: [0.3, 1.8, 0.5, 1], delay: atraso + (atraso ? 0.15 : 0) }}
                aria-hidden
              >
                <Check className="size-2.5" strokeWidth={3.5} />
              </motion.span>
            )}
          </motion.li>
        );
      })}
    </ul>
  );
}

/* ── O texto ─────────────────────────────────────────────────────────────
 *
 *  Uma espera sem motivo declarado é sempre mais longa do que a mesma espera
 *  explicada. A primeira linha diz o que está sendo conferido e onde; a
 *  segunda só aparece quando a espera passa do que é normal, e serve para
 *  dizer que a tela vai abrir de qualquer jeito — que ninguém ficará preso
 *  aqui. */
const ALVO_DA_TELA: Partial<Record<TelaAtualizavel, string>> = {
  vendas: "as vendas",
  avaliacoes: "as avaliações",
  estoque: "o estoque",
  metricas: "os números",
  anuncios: "os anúncios",
  clientes: "os clientes",
};

const MS_PARA_TRANQUILIZAR = 7_000;

/** Quem ainda não respondeu, pelo nome, para a frase de espera longa. */
function quemDemora(canais: ProgressoCanal[]): string | null {
  const faltando = canais.filter((item) => item.progresso < 100).map((item) => item.label);
  if (faltando.length === 0) return null;
  if (faltando.length === 1) return `${faltando[0]} está demorando`;
  return `${faltando.slice(0, -1).join(", ")} e ${faltando.at(-1)} estão demorando`;
}


/** "Shopee", "Shopee e TikTok Shop", "Mercado Livre, Shopee e TikTok Shop". */
function listaDeNomes(nomes: string[]): string {
  if (nomes.length <= 1) return nomes[0] ?? "";
  return `${nomes.slice(0, -1).join(", ")} e ${nomes.at(-1)}`;
}

/* O final tem três tempos, e cada um precisa ser VISTO:
   1. o número fecha em 100 e ganha destaque;
   2. quem faltava acende, um de cada vez;
   3. uma pausa curta com tudo verde — o bastante para ser notada, curta o
      bastante para não virar pedágio.
   O teto é a rede de segurança — com a aba em segundo plano o
   requestAnimationFrame para, a contagem não chega a 100 e a cobertura
   ficaria presa. */
const MS_ENTRE_FICHAS = 350;
const MS_SEGURAR_CEM = 1_300;
const MS_SEGURAR_FALHA = 2_200;
const MS_TETO_FINAL = 7_000;

export function BloqueioAtualizacao({
  progresso,
  canais = [],
  tela,
  finalizar = null,
  aoTerminar,
}: {
  progresso: number;
  canais?: ProgressoCanal[];
  tela: TelaAtualizavel | null;
  /** "sucesso": correr até 100, acender tudo e segurar. "falha": parar onde
   *  está e dizer quem não respondeu. Nos dois, avisar quando o final já foi
   *  visto. */
  finalizar?: "sucesso" | "falha" | null;
  aoTerminar?: () => void;
}) {
  /* Enquanto o AnimatePresence toca a saída, o componente ainda está montado
     mas já não está "presente". Numa saída sem espera, é a deixa para a
     contagem fechar dentro do fade. Depois de uma falha, não: correr até 100
     ali seria dizer "carregou tudo" justo quando não carregou. */
  const concluindo = !useIsPresent();
  const reduzir = useReducedMotion() ?? false;
  const [houveFalha, setHouveFalha] = useState(false);
  if (finalizar === "falha" && !houveFalha) setHouveFalha(true);
  const sucesso = finalizar === "sucesso";
  const correrAteCem = sucesso || (concluindo && !houveFalha);
  const suave = useContagemCrescente(progresso, correrAteCem, houveFalha);
  const valor = reduzir ? Math.round(sucesso ? 100 : Math.min(progresso, 100)) : suave;
  const [demorou, setDemorou] = useState(false);
  const chegouEmCem = sucesso && valor >= 99.999;

  /* Foto de quem ainda falta. O "pronto" chega do servidor com todos os
     canais em 100 — muitas vezes segundos antes de a cobertura sair — e, lido
     cru, acenderia os selos de uma vez, sem o número. A foto guarda a última
     lista de atrasados para o final acender cada um na sua vez. */
  const vivos = canais.filter((item) => item.progresso < 100).map((item) => item.label);
  const [atrasados, setAtrasados] = useState<string[]>([]);
  if (!finalizar && vivos.length > 0 && vivos.join("|") !== atrasados.join("|")) setAtrasados(vivos);
  const emFinal = finalizar !== null || (canais.length > 0 && vivos.length === 0 && atrasados.length > 0);

  useEffect(() => {
    const relogio = window.setTimeout(() => setDemorou(true), MS_PARA_TRANQUILIZAR);
    return () => window.clearTimeout(relogio);
  }, []);

  const aoTerminarRef = useRef(aoTerminar);
  useEffect(() => { aoTerminarRef.current = aoTerminar; }, [aoTerminar]);
  const quantosAcendem = atrasados.length;

  useEffect(() => {
    if (!finalizar) return;
    const teto = window.setTimeout(
      () => aoTerminarRef.current?.(),
      finalizar === "falha" ? MS_SEGURAR_FALHA : MS_TETO_FINAL,
    );
    return () => window.clearTimeout(teto);
  }, [finalizar]);

  useEffect(() => {
    if (!chegouEmCem) return;
    // Segura depois que a ÚLTIMA ficha acendeu, não a partir do 100.
    const acendendo = reduzir ? 0 : (quantosAcendem + 1) * MS_ENTRE_FICHAS;
    const segurar = window.setTimeout(() => aoTerminarRef.current?.(), acendendo + MS_SEGURAR_CEM);
    return () => window.clearTimeout(segurar);
  }, [chegouEmCem, reduzir, quantosAcendem]);

  const demora = quemDemora(canais);
  const nomesAtrasados = listaDeNomes(atrasados);

  return (
    <motion.div
      /* z-40 para ficar ACIMA das barras de navegação (z-30). Elas já estavam
         inertes durante o bloqueio, mas apareciam por cima da cobertura: menu
         visível e morto ao mesmo tempo, que é pior do que menu nenhum.
         pointer-events some na saída — durante o meio segundo do fade a
         cobertura ainda cobre a tela e engoliria o primeiro clique. */
      className={`fixed inset-0 z-40 grid place-items-center bg-background px-6 ${
        concluindo ? "pointer-events-none" : ""
      }`}
      initial={reduzir ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduzir ? 0 : 0.5, ease: [0.22, 1, 0.36, 1] }}
      role="progressbar"
      aria-valuenow={Math.round(Math.min(valor, 100))}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Confirmando os dados nos canais"
    >
      <div className="flex flex-col items-center">
        <motion.div
          className="flex flex-col items-center"
          initial={reduzir ? false : { scale: 0.94, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: reduzir ? 0 : 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="relative">
            {/* O destaque do 100: uma onda verde que abre por trás do número
                e o próprio número dando um salto curto, já em verde. É o
                "chegou" que antes passava sem ser visto. */}
            {chegouEmCem && !reduzir && (
              <motion.span
                aria-hidden
                className="pointer-events-none absolute -inset-6 rounded-full bg-emerald-400/25"
                initial={{ scale: 0.4, opacity: 0.9 }}
                animate={{ scale: 1.5, opacity: 0 }}
                transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
              />
            )}
            <motion.span
              className={`relative block text-[clamp(4rem,16vw,6rem)] font-black leading-none tracking-[-0.055em] tabular-nums transition-colors duration-300 ${
                chegouEmCem ? "text-emerald-600" : "text-foreground"
              }`}
              initial={false}
              animate={chegouEmCem && !reduzir ? { scale: [1, 1.12, 1] } : { scale: 1 }}
              transition={{ duration: 0.5, ease: [0.3, 1.6, 0.5, 1] }}
            >
              {reduzir
                ? <>{valor}<span className="ml-[0.06em] text-[0.34em] font-bold text-muted-foreground">%</span></>
                : <Odometro valor={valor} />}
            </motion.span>
          </span>
          <FichasCanais
            canais={canais}
            atrasados={atrasados}
            emFinal={emFinal}
            tudoPronto={chegouEmCem}
            reduzir={reduzir}
          />
        </motion.div>

        <p className="mt-7 flex items-center gap-1.5 text-center text-sm font-semibold text-foreground">
          {chegouEmCem ? (
            <motion.span
              key="ok"
              className="flex items-center gap-1.5"
              initial={reduzir ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Check className="size-4 text-emerald-600" strokeWidth={3} aria-hidden />
              Tudo confirmado nos canais
            </motion.span>
          ) : houveFalha ? (
            <>Abrindo com o último dado confirmado</>
          ) : (
            <>Conferindo {(tela && ALVO_DA_TELA[tela]) ?? "os dados"} nos canais</>
          )}
        </p>

        <div className="mt-1.5 h-8 max-w-[22rem] text-center">
          {chegouEmCem && atrasados.length > 0 ? (
            <motion.p
              key="carregou"
              initial={reduzir ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduzir ? 0 : 0.35, delay: reduzir ? 0 : atrasados.length * MS_ENTRE_FICHAS / 1000 }}
              className="text-xs leading-relaxed text-muted-foreground"
            >
              {nomesAtrasados} {atrasados.length === 1 ? "carregou" : "carregaram"} com sucesso.
            </motion.p>
          ) : houveFalha ? (
            <motion.p
              key="falhou"
              initial={reduzir ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduzir ? 0 : 0.35 }}
              className="text-xs leading-relaxed text-muted-foreground"
            >
              {atrasados.length > 0
                ? `${nomesAtrasados} ${atrasados.length === 1 ? "ainda não respondeu" : "ainda não responderam"}. `
                : ""}
              A confirmação continua por trás e a tela avisa quando chegar.
            </motion.p>
          ) : demorou && !concluindo && !finalizar && (vivos.length > 0 || canais.length === 0) ? (
            <motion.p
              key="demora"
              initial={reduzir ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduzir ? 0 : 0.35 }}
              className="text-xs leading-relaxed text-muted-foreground"
            >
              {demora ?? "Um canal está demorando"} mais que o normal. A tela
              abre em instantes com o último dado confirmado.
            </motion.p>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}
