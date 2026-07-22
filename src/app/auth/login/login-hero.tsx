"use client";

import { motion } from "framer-motion";

export function LoginHero() {
  return (
    <div className="mb-10 flex flex-col items-center relative">
      {/* Ilustração — esferas decorativas de fundo */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <motion.div
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 0.18, scale: 1 }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          className="absolute -top-16 -left-24 w-64 h-64 rounded-full"
          style={{ background: "var(--gradient-signature)", filter: "blur(56px)" }}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 0.13, scale: 1 }}
          transition={{ duration: 1.4, ease: "easeOut", delay: 0.1 }}
          className="absolute -bottom-20 -right-20 w-56 h-56 rounded-full"
          style={{ background: "var(--gradient-signature)", filter: "blur(64px)" }}
        />
      </div>

      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logos/uncao.svg"
          alt="KARZI | WUWU"
          style={{ height: 52, width: "auto", display: "block", objectFit: "contain" }}
        />
      </motion.div>
    </div>
  );
}
