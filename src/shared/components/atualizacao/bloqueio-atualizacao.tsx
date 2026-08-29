"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useIsPresent, useReducedMotion } from "framer-motion";
import { casasDe, deslocamentoDaRoda, proximoValor } from "./contagem";
import type { TelaAtualizavel } from "@/modules/canais/application/painel-atualizacao.service";

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

/* ── O anel ──────────────────────────────────────────────────────────────
 *
 *  O número diz quanto falta; o anel diz a mesma coisa sem exigir leitura. O
 *  ponto na ponta marca a cabeça do progresso — e quando a contagem alcança o
 *  alvo mas o canal ainda não respondeu, é ele que respira, para separar
 *  "parado porque acabou" de "parado esperando". */
const RAIO = 54;
const CIRCUNFERENCIA = 2 * Math.PI * RAIO;

function Anel({ valor, esperando, reduzir }: {
  valor: number;
  esperando: boolean;
  reduzir: boolean;
}) {
  const fracao = Math.min(valor, 100) / 100;
  const angulo = fracao * 2 * Math.PI - Math.PI / 2;
  const px = 60 + RAIO * Math.cos(angulo);
  const py = 60 + RAIO * Math.sin(angulo);

  return (
    <svg viewBox="0 0 120 120" className="absolute inset-0 size-full" aria-hidden>
      <circle cx="60" cy="60" r={RAIO} fill="none" stroke="var(--border)" strokeWidth="2" />
      <circle
        cx="60"
        cy="60"
        r={RAIO}
        fill="none"
        stroke="var(--foreground)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={CIRCUNFERENCIA}
        strokeDashoffset={CIRCUNFERENCIA * (1 - fracao)}
        transform="rotate(-90 60 60)"
      />
      {esperando && !reduzir && (
        <motion.circle
          cx={px}
          cy={py}
          r="7"
          fill="var(--foreground)"
          animate={{ opacity: [0.16, 0, 0.16], r: [6, 12, 6] }}
          transition={{ duration: 1.9, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
      <circle cx={px} cy={py} r="3.5" fill="var(--foreground)" />
    </svg>
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

export function BloqueioAtualizacao({ progresso, tela }: {
  progresso: number;
  tela: TelaAtualizavel | null;
}) {
  /* Enquanto o AnimatePresence toca a saída, o componente ainda está montado
     mas já não está "presente". É a deixa para a contagem correr até 100
     dentro do fade — sem isso o número sumiria da tela em 63, que é
     exatamente o salto que este componente existe para não dar. */
  const concluindo = !useIsPresent();
  const reduzir = useReducedMotion() ?? false;
  const suave = useContagemCrescente(progresso, concluindo);
  const valor = reduzir ? Math.round(Math.min(progresso, 100)) : suave;
  const [demorou, setDemorou] = useState(false);

  useEffect(() => {
    const relogio = window.setTimeout(() => setDemorou(true), MS_PARA_TRANQUILIZAR);
    return () => window.clearTimeout(relogio);
  }, []);

  const esperando = !concluindo && suave >= Math.min(progresso, 100) - 0.5 && progresso < 100;

  return (
    <motion.div
      className="fixed inset-0 z-20 grid place-items-center bg-background px-6"
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
          className="relative grid size-[clamp(11rem,44vw,14.5rem)] place-items-center"
          initial={reduzir ? false : { scale: 0.94, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: reduzir ? 0 : 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <Anel valor={valor} esperando={esperando} reduzir={reduzir} />
          <span className="text-[clamp(2.5rem,9vw,3.75rem)] font-black leading-none tracking-[-0.055em] tabular-nums text-foreground">
            {reduzir
              ? <>{valor}<span className="ml-[0.06em] text-[0.34em] font-bold text-muted-foreground">%</span></>
              : <Odometro valor={valor} />}
          </span>
        </motion.div>

        <p className="mt-7 text-center text-sm font-semibold text-foreground">
          Conferindo {(tela && ALVO_DA_TELA[tela]) ?? "os dados"} nos canais
        </p>

        <div className="mt-1.5 h-8 max-w-[22rem] text-center">
          {demorou && !concluindo && (
            <motion.p
              initial={reduzir ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduzir ? 0 : 0.35 }}
              className="text-xs leading-relaxed text-muted-foreground"
            >
              Um canal está demorando mais que o normal. A tela abre em
              instantes com o último dado confirmado.
            </motion.p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
