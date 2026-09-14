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
function useContagemCrescente(alvo: number, concluindo: boolean): number {
  const [valor, setValor] = useState(0);
  const valorRef = useRef(0);
  const alvoRef = useRef(0);
  const concluindoRef = useRef(concluindo);

  /* Trava de monotonicidade: o alvo só sobe. O servidor pode reportar 40
     depois de 55 — acontece quando uma conta nova entra no cálculo — e
     regredir na tela leria como defeito. O laço de quadros lê estes refs, e
     um quadro de atraso até a próxima leitura não se percebe. */
  useEffect(() => {
    alvoRef.current = Math.max(alvoRef.current, concluindo ? 100 : alvo);
    concluindoRef.current = concluindo;
  }, [alvo, concluindo]);

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
function FichasCanais({ canais, tudoPronto, reduzir }: {
  canais: ProgressoCanal[];
  /** Só vale quando a confirmação deu certo. Numa saída por falha as fichas
   *  continuam como estavam: acender o canal que não respondeu seria mentir. */
  tudoPronto: boolean;
  reduzir: boolean;
}) {
  if (canais.length === 0) return null;

  return (
    <ul className="mt-6 flex items-center gap-3" aria-label="Canais">
      {canais.map((item, indice) => {
        const jaEstava = item.progresso >= 100;
        const pronto = tudoPronto || jaEstava;
        /* No final, quem ainda estava apagado acende um de cada vez — ver os
           selos chegando é o que diz "carregou tudo". */
        const atraso = tudoPronto && !jaEstava && !reduzir ? MS_ENTRE_FICHAS / 1000 * (indice + 1) : 0;
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

/* Quanto o 100% com todas as fichas acesas fica parado antes de a tela abrir:
   o bastante para ser lido, curto o bastante para não virar pedágio. O teto
   é a rede de segurança — com a aba em segundo plano o requestAnimationFrame
   para, a contagem não chega a 100 e a cobertura ficaria presa. */
const MS_ENTRE_FICHAS = 350;
const MS_SEGURAR_CEM = 1_800;
const MS_TETO_FINAL = 7_000;

export function BloqueioAtualizacao({
  progresso,
  canais = [],
  tela,
  finalizar = false,
  aoTerminar,
}: {
  progresso: number;
  canais?: ProgressoCanal[];
  tela: TelaAtualizavel | null;
  /** A confirmação deu certo: correr até 100, acender tudo e avisar quando
   *  o final já foi visto. */
  finalizar?: boolean;
  aoTerminar?: () => void;
}) {
  /* Enquanto o AnimatePresence toca a saída, o componente ainda está montado
     mas já não está "presente". É a deixa para a contagem correr até 100
     dentro do fade — sem isso o número sumiria da tela em 63, que é
     exatamente o salto que este componente existe para não dar. */
  const concluindo = !useIsPresent();
  const reduzir = useReducedMotion() ?? false;
  const suave = useContagemCrescente(progresso, concluindo || finalizar);
  const valor = reduzir ? Math.round(finalizar ? 100 : Math.min(progresso, 100)) : suave;
  const [demorou, setDemorou] = useState(false);
  const chegouEmCem = finalizar && valor >= 99.999;

  useEffect(() => {
    const relogio = window.setTimeout(() => setDemorou(true), MS_PARA_TRANQUILIZAR);
    return () => window.clearTimeout(relogio);
  }, []);

  const aoTerminarRef = useRef(aoTerminar);
  useEffect(() => { aoTerminarRef.current = aoTerminar; }, [aoTerminar]);
  const canaisRef = useRef(canais);
  useEffect(() => { canaisRef.current = canais; }, [canais]);

  useEffect(() => {
    if (!finalizar) return;
    const teto = window.setTimeout(() => aoTerminarRef.current?.(), MS_TETO_FINAL);
    return () => window.clearTimeout(teto);
  }, [finalizar]);

  useEffect(() => {
    if (!chegouEmCem) return;
    // Segura depois que a ÚLTIMA ficha acendeu, não a partir do 100.
    const acendendo = reduzir ? 0 : (canaisRef.current.length + 1) * MS_ENTRE_FICHAS;
    const segurar = window.setTimeout(() => aoTerminarRef.current?.(), acendendo + MS_SEGURAR_CEM);
    return () => window.clearTimeout(segurar);
  }, [chegouEmCem, reduzir]);

  const demora = quemDemora(canais);

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
      /* A saída é mais longa que a entrada de propósito: é dentro dela que a
         contagem fecha os últimos números. */
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
          <span className="text-[clamp(4rem,16vw,6rem)] font-black leading-none tracking-[-0.055em] tabular-nums text-foreground">
            {reduzir
              ? <>{valor}<span className="ml-[0.06em] text-[0.34em] font-bold text-muted-foreground">%</span></>
              : <Odometro valor={valor} />}
          </span>
          <FichasCanais canais={canais} tudoPronto={chegouEmCem} reduzir={reduzir} />
        </motion.div>

        <p className="mt-7 flex items-center gap-1.5 text-center text-sm font-semibold text-foreground">
          {chegouEmCem ? (
            <>
              <Check className="size-4 text-emerald-600" strokeWidth={3} aria-hidden />
              Tudo confirmado nos canais
            </>
          ) : (
            <>Conferindo {(tela && ALVO_DA_TELA[tela]) ?? "os dados"} nos canais</>
          )}
        </p>

        <div className="mt-1.5 h-8 max-w-[22rem] text-center">
          {demorou && !concluindo && !finalizar && (
            <motion.p
              initial={reduzir ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduzir ? 0 : 0.35 }}
              className="text-xs leading-relaxed text-muted-foreground"
            >
              {demora ?? "Um canal está demorando"} mais que o normal. A tela
              abre em instantes com o último dado confirmado.
            </motion.p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
