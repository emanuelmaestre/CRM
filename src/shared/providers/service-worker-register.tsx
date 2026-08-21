"use client";

import { useEffect } from "react";

/** Só existe pra registrar public/sw.js — sem worker registrado, o Chrome
 *  no Android não considera o app instalável e nunca oferece o prompt
 *  nativo de "Instalar app" (o objetivo aqui: instalação sem nenhum botão
 *  nosso ocupando espaço na tela). Não faz nada visível, não bloqueia o
 *  primeiro render, e falha em silêncio em navegadores sem suporte. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  return null;
}
