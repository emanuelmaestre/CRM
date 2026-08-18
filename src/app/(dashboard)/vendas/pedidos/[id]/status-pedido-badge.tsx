"use client";

import { motion, useReducedMotion } from "framer-motion";
import { springs, transicao } from "@/shared/design-system/motion-variants";

/** A página que usa isto é Server Component — o status vem pronto do banco a
 *  cada render, sem estado local para comparar "antes" e "depois". O truque
 *  é a prop `key={status}` que o chamador passa: sempre que o valor do status
 *  muda (ex.: cancelar o pedido dispara `router.refresh()`), o React trata
 *  este componente como uma instância nova e replay a entrada — é o que dá o
 *  "pulso" de confirmação sem precisar de estado ou efeito algum aqui. */
export function StatusPedidoBadge({ label, cor }: { label: string; cor: string }) {
  const reduzir = useReducedMotion();

  return (
    <motion.span
      data-testid="status-pedido"
      initial={reduzir ? false : { opacity: 0, scale: 1.06 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={transicao(reduzir, springs.settle)}
      className="rounded-full px-3 py-1.5 text-sm font-semibold"
      style={{
        background: `color-mix(in srgb, ${cor} 10%, transparent)`,
        color: cor,
      }}
    >
      {label}
    </motion.span>
  );
}
