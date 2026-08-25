"use client";

import { motion } from "framer-motion";
import { eases } from "@/shared/design-system/motion-variants";
import { ElisaLimaLogo } from "@/shared/design-system/primitives/ElisaLimaLogo";

export function LoginHero() {
  return (
    <div className="mb-8 flex flex-col items-center text-center">
      <h1 className="sr-only">Entrar no CRM Elisa Lima</h1>

      <motion.div
        initial={{ opacity: 0, y: -6, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: eases.emphasized }}
      >
        <ElisaLimaLogo variant="login" />
      </motion.div>
    </div>
  );
}
