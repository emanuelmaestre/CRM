"use client";

import { motion } from "framer-motion";
import { cn } from "../cn";
import { springs } from "../motion-variants";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springs.settleFast}
      className={cn("mb-6 flex min-w-0 flex-col items-stretch gap-4 sm:flex-row sm:items-start sm:justify-between", className)}
    >
      <div className="min-w-0">
        <h1
          className="text-[clamp(1.35rem,3vw,1.5rem)] font-bold leading-tight text-foreground"
          style={{ fontFamily: "var(--font-sora)", letterSpacing: "-0.02em" }}
        >
          {title}
        </h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      {actions && (
        <motion.div
          initial={{ opacity: 0, x: 4 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ ...springs.settleFast, delay: 0.08 }}
          className="flex min-w-0 flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end"
        >
          {actions}
        </motion.div>
      )}
    </motion.div>
  );
}
