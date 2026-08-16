"use client";

import { useSyncExternalStore } from "react";

/* ── Viewport ────────────────────────────────────────────────────
   Usado pelos painéis recolhíveis (Conversas/Perguntas) para nunca deixar o
   painel escondido/encolhido sem jeito de voltar no mobile — o botão de
   recolher só existe em telas lg, então qualquer estado "recolhido" precisa
   ser ignorado abaixo desse breakpoint. */
const MOBILE_QUERY = "(max-width: 1023px)";

function assinarViewport(onChange: () => void) {
  const mq = window.matchMedia(MOBILE_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

const lerViewport = () => window.matchMedia(MOBILE_QUERY).matches;
/* No servidor não há viewport; assume desktop, igual ao estado inicial de antes. */
const lerViewportNoServidor = () => false;

export function useMobileViewport(): boolean {
  return useSyncExternalStore(assinarViewport, lerViewport, lerViewportNoServidor);
}
