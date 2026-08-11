"use client";

import { useEffect, useRef } from "react";
import { animate, motion, useMotionValue, useTransform, useReducedMotion } from "framer-motion";

interface NumeroAnimadoProps {
  valor: number;
  /** Anima só na estreia. O PRD §14.5 é explícito: "número não dança depois de
   *  carregado" — então trocar de filtro atualiza o valor direto. Passe `false`
   *  onde o caminhar do número É a informação (a prévia do wizard, em que ver
   *  34 virar 12 mostra que a régua ficou mais frouxa). */
  apenasPrimeiraVez?: boolean;
  /** Segundos. Padrão 0,6s — a duração de métrica do PRD §14.5. */
  duracao?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Contagem animada (number-flow) para métricas.
 *
 * Anima um MotionValue em vez de estado do React: a contagem não dispara um
 * render por frame, e o `prefers-reduced-motion` é respeitado de verdade — o
 * CSS global de reduced-motion não alcança animação feita em JavaScript, então
 * o gate tem que estar aqui.
 */
export function NumeroAnimado({
  valor,
  apenasPrimeiraVez = true,
  duracao = 0.6,
  className,
  style,
}: NumeroAnimadoProps) {
  const reduzir = useReducedMotion();
  const contagem = useMotionValue(0);
  const texto = useTransform(contagem, (atual) => String(Math.round(atual)));
  const jaAnimou = useRef(false);

  useEffect(() => {
    if (reduzir || (apenasPrimeiraVez && jaAnimou.current)) {
      contagem.set(valor);
      return;
    }
    jaAnimou.current = true;
    const controles = animate(contagem, valor, { duration: duracao, ease: [0, 0, 0.2, 1] });
    return () => controles.stop();
  }, [valor, reduzir, apenasPrimeiraVez, duracao, contagem]);

  // Sem animação, nada de MotionValue: renderizar o valor direto evita o frame
  // inicial em "0" que a contagem precisa como ponto de partida.
  if (reduzir) return <span className={className} style={style}>{valor}</span>;

  return <motion.span className={className} style={style}>{texto}</motion.span>;
}
