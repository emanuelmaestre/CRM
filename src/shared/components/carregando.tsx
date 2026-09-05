"use client";

import { Loader2 } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

/** Âmbar do "ainda não é o dado final".
 *
 *  Uma cor só para os dois momentos: enquanto os canais são consultados e
 *  enquanto o que está na tela é de antes. São o mesmo assunto — o número
 *  ainda não está confirmado — e usar cinza num e âmbar no outro fazia
 *  parecer que eram dois avisos diferentes. */
export const AMBAR = "245 158 11";

/** Espera de módulo: a mesma marca da tarja de atualização, em linha.
 *
 *  Todo módulo tinha o seu: um `Loader2` cinza com um texto ao lado, cada um
 *  com um tamanho e um tom. Quem passa de Vendas para Estoque via a mesma
 *  espera pintada de três jeitos. Aqui a espera tem uma cor só, e o pulso do
 *  texto diz "isto está andando" sem precisar de mais um elemento na tela. */
export function Carregando({ texto, className = "", cartao = false }: {
  texto: string;
  /** Envolve num cartão — para quando a espera ocupa o lugar de um bloco
   *  inteiro (a faixa de saúde do Estoque, por exemplo) em vez de um trecho. */
  cartao?: boolean;
  className?: string;
}) {
  const reduzir = useReducedMotion() ?? false;

  const miolo = (
    <>
      <Loader2 size={17} className="shrink-0 animate-spin" style={{ color: `rgb(${AMBAR})` }} aria-hidden />
      <motion.span
        className="text-sm text-muted-foreground"
        animate={reduzir ? undefined : { opacity: [1, 0.55, 1] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
      >
        {texto}
      </motion.span>
    </>
  );

  if (!cartao) {
    return (
      <div role="status" className={`flex items-center justify-center gap-2.5 ${className}`}>
        {miolo}
      </div>
    );
  }

  return (
    <div
      role="status"
      className={`relative flex items-center gap-3 overflow-hidden rounded-[1.25rem] bg-card px-5 py-4 shadow-[0_2px_16px_rgba(14,15,19,.07)] ${className}`}
      style={{ boxShadow: `inset 0 0 0 1px rgb(${AMBAR} / 0.22), 0 2px 16px rgba(14,15,19,.07)` }}
    >
      {/* Varredura na aresta de cima: a mesma da tarja, para que a espera em
          bloco e a espera em tarja sejam reconhecíveis como a mesma coisa. */}
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[2px] overflow-hidden">
        <motion.span
          className="absolute inset-y-0 w-1/3"
          style={{ background: `linear-gradient(90deg, transparent, rgb(${AMBAR}), transparent)`, opacity: 0.8 }}
          initial={{ x: "-120%" }}
          animate={reduzir ? { x: "150%" } : { x: ["-120%", "320%"] }}
          transition={reduzir ? { duration: 0 } : { duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        />
      </span>
      {miolo}
    </div>
  );
}
