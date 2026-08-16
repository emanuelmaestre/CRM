"use client";

import { useEffect, type RefObject } from "react";

const SELETOR_FOCAVEL =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Prende o Tab dentro de `containerRef` enquanto `ativo`, e devolve o foco a
 *  quem estava focado antes de abrir assim que `ativo` vira false (ou o
 *  componente desmonta). Para diálogos customizados que não usam Radix —
 *  sem isso, Tab escapa para trás do modal e fechar deixa o foco perdido
 *  no `<body>`, quebrando a navegação de quem usa só teclado. */
export function useFocusTrap(containerRef: RefObject<HTMLElement | null>, ativo: boolean) {
  useEffect(() => {
    if (!ativo) return;
    const elementoAnterior = document.activeElement as HTMLElement | null;

    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key !== "Tab") return;
      const container = containerRef.current;
      if (!container) return;
      const focaveis = Array.from(container.querySelectorAll<HTMLElement>(SELETOR_FOCAVEL)).filter(
        (elemento) => elemento.offsetParent !== null,
      );
      if (focaveis.length === 0) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];

      if (evento.shiftKey && document.activeElement === primeiro) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primeiro.focus();
      }
    }

    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      elementoAnterior?.focus?.();
    };
  }, [ativo, containerRef]);
}
