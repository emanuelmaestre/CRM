"use client";

import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowRight, ArrowLeft } from "lucide-react";
import { cn } from "../cn";

export interface CoachMarkStep {
  target: string;
  title: string;
  description: string;
}

interface CoachMarksProps {
  storageKey: string;
  steps: CoachMarkStep[];
}

function useTargetRect(selector: string | null) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const update = () => {
      if (!selector) { setRect(null); return; }
      // Telas responsivas costumam ter o mesmo alvo duas vezes (variante mobile
      // e variante desktop, uma delas com display:none). querySelector pegaria
      // a primeira do DOM, que pode ser justamente a oculta — e o anel do tour
      // apareceria colado no canto, com tamanho zero. Fica com a que está de
      // fato renderizada.
      const alvos = Array.from(document.querySelectorAll(selector));
      const visivel = alvos
        .map((el) => el.getBoundingClientRect())
        .find((r) => r.width > 0 && r.height > 0);
      setRect(visivel ?? null);
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const id = window.setInterval(update, 300);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.clearInterval(id);
    };
  }, [selector]);

  return rect;
}

export function CoachMarks({ storageKey, steps }: CoachMarksProps) {
  const [mounted, setMounted] = useState(false);
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    const init = () => {
      setMounted(true);
      try {
        const seen = window.localStorage.getItem(storageKey);
        if (!seen && steps.length > 0) setActive(true);
      } catch {
        // localStorage indisponível (modo privado); não bloqueia o app.
      }
    };
    init();
  }, [storageKey, steps.length]);

  const finalizar = useCallback(() => {
    setActive(false);
    try {
      window.localStorage.setItem(storageKey, "seen");
    } catch {
      // ignora falha de persistência
    }
  }, [storageKey]);

  const step = active ? steps[stepIndex] : undefined;
  const rect = useTargetRect(step?.target ?? null);

  if (!mounted || !active || !step) return null;

  const viewportGap = 16;
  const cardWidth = Math.min(320, window.innerWidth - viewportGap * 2);
  const estimatedCardHeight = 230;
  const cardTop = rect
    ? Math.max(viewportGap, Math.min(window.innerHeight - estimatedCardHeight - viewportGap, rect.bottom + 12))
    : Math.max(viewportGap, (window.innerHeight - estimatedCardHeight) / 2);
  const cardLeft = rect
    ? Math.max(viewportGap, Math.min(window.innerWidth - cardWidth - viewportGap, rect.left))
    : (window.innerWidth - cardWidth) / 2;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="coachmark-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[300] bg-black/35"
        onClick={finalizar}
        data-testid="coachmark-overlay"
      />
      {rect && (
        <motion.div
          key="coachmark-ring"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed z-[301] rounded-2xl ring-4 ring-offset-2 pointer-events-none"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)",
          }}
        />
      )}
      <motion.div
        key={`coachmark-card-${stepIndex}`}
        initial={{ opacity: 0, y: 8, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.97 }}
        transition={{ duration: 0.2, ease: [0, 0, 0.2, 1] }}
        className="fixed z-[302] max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain rounded-[1.25rem] bg-card p-4 shadow-[0_16px_40px_rgba(14,15,19,.16)] sm:p-5"
        style={{ top: cardTop, left: cardLeft, width: cardWidth }}
        role="dialog"
        aria-live="polite"
        data-testid="coachmark-card"
      >
        <button
          type="button"
          onClick={finalizar}
          aria-label="Fechar tour"
          className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted sm:right-2.5 sm:top-2.5"
        >
          <X size={14} />
        </button>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Passo {stepIndex + 1} de {steps.length}
        </p>
        <h3 className="mt-1 text-sm font-bold text-foreground">{step.title}</h3>
        <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{step.description}</p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={finalizar}
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Pular tour
          </button>
          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={() => setStepIndex((i) => i - 1)}
                className={cn(
                  "inline-flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted",
                )}
                aria-label="Passo anterior"
              >
                <ArrowLeft size={14} />
              </button>
            )}
            <button
              type="button"
              onClick={() => (stepIndex < steps.length - 1 ? setStepIndex((i) => i + 1) : finalizar())}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3.5 text-sm font-semibold text-white"
              style={{ background: "var(--gradient-signature)" }}
            >
              {stepIndex < steps.length - 1 ? "Próximo" : "Concluir"}
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
