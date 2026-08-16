"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ShieldOff } from "lucide-react";
import permissionsConfig from "@/config/permissions.json";

export default function SemPermissaoPage() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.24, ease: [0, 0, 0.2, 1] }}
      className="mx-auto flex min-h-[50vh] max-w-xl flex-col items-center justify-center rounded-[1.25rem] bg-card px-8 py-10 text-center shadow-[0_2px_16px_rgba(14,15,19,.07)]"
    >
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <ShieldOff aria-hidden="true" size={26} strokeWidth={1.75} />
      </div>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
        {permissionsConfig.messages.restrictedEyebrow}
      </p>
      <h1 className="mt-3 text-2xl font-bold text-foreground" style={{ fontFamily: "var(--font-sora)" }}>
        {permissionsConfig.messages.forbiddenTitle}
      </h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {permissionsConfig.messages.forbiddenDescription}
      </p>
      <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="mt-6">
        <Link
          href="/metricas"
          className="inline-flex h-11 items-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground"
        >
          {permissionsConfig.messages.backToDashboard}
        </Link>
      </motion.div>
    </motion.section>
  );
}
