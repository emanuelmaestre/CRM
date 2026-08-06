"use client";

import { motion } from "framer-motion";

const VERDE = "#1F8A4C";

/** Bolinha de status: ganha halo pulsante quando a marca está conectada. */
export function StatusDot({ conectado, alerta = false }: { conectado: boolean; alerta?: boolean }) {
  const cor = alerta ? "#B57A00" : conectado ? VERDE : "var(--muted-foreground)";
  return (
    <span className="relative flex h-2 w-2 shrink-0 items-center justify-center">
      {conectado && !alerta && (
        <motion.span
          className="absolute inset-0 rounded-full"
          style={{ background: cor }}
          animate={{ scale: [1, 2.2, 1], opacity: [0.45, 0, 0.45] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
        />
      )}
      <span className="relative h-2 w-2 rounded-full" style={{ background: cor }} />
    </span>
  );
}
