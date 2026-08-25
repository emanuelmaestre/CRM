"use client";

import { motion, useReducedMotion } from "framer-motion";

/* ── Cenário do login ─────────────────────────────────────────────
   Três esferas com blur orbitando lentamente atrás do card, mais uma
   grade de pontos sutil pra dar textura ao fundo liso. Tudo `aria-hidden`
   e imóvel para quem pediu movimento reduzido — vira só um gradiente
   parado, sem perder a composição. */
export function LoginBackground() {
  const reduzir = useReducedMotion();

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.4]"
        style={{
          backgroundImage: "radial-gradient(color-mix(in srgb, var(--foreground) 10%, transparent) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          maskImage: "radial-gradient(ellipse 60% 50% at 50% 40%, black, transparent)",
        }}
      />
      <motion.div
        className="absolute -top-32 left-[8%] h-72 w-72 rounded-full"
        style={{ background: "var(--gradient-signature)", filter: "blur(80px)" }}
        initial={{ opacity: 0 }}
        animate={
          reduzir
            ? { opacity: 0.16 }
            : { opacity: 0.16, x: [0, 24, 0], y: [0, 16, 0] }
        }
        transition={reduzir ? { duration: 0.6 } : { duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute top-1/3 -right-24 h-80 w-80 rounded-full"
        style={{ background: "var(--karzi)", filter: "blur(96px)" }}
        initial={{ opacity: 0 }}
        animate={
          reduzir
            ? { opacity: 0.1 }
            : { opacity: 0.1, x: [0, -20, 0], y: [0, -24, 0] }
        }
        transition={reduzir ? { duration: 0.6 } : { duration: 16, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
      />
      <motion.div
        className="absolute -bottom-28 left-1/4 h-64 w-64 rounded-full"
        style={{ background: "var(--wuwu)", filter: "blur(88px)" }}
        initial={{ opacity: 0 }}
        animate={
          reduzir
            ? { opacity: 0.08 }
            : { opacity: 0.08, x: [0, 18, 0], y: [0, -12, 0] }
        }
        transition={reduzir ? { duration: 0.6 } : { duration: 18, repeat: Infinity, ease: "easeInOut", delay: 1 }}
      />
    </div>
  );
}
