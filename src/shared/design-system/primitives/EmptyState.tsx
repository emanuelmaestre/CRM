"use client";

import {
  Users, Package, Filter, Inbox, MessageSquare, ClipboardList,
  BarChart2, AlertTriangle, CircleOff, ShieldOff, LucideIcon,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "../cn";

const icons: Record<string, LucideIcon> = {
  clients:      Users,
  products:     Package,
  funnel:       Filter,
  inbox:        Inbox,
  conversation: MessageSquare,
  tasks:        ClipboardList,
  reports:      BarChart2,
  alerts:       AlertTriangle,
  blocked:      ShieldOff,
  generic:      CircleOff,
};

export type IllustrationType = keyof typeof icons;

interface EmptyStateProps {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  illustration?: IllustrationType;
  className?: string;
}

export function EmptyState({
  title, description, action, illustration = "generic", className,
}: EmptyStateProps) {
  const Icon = icons[illustration] ?? CircleOff;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.24, ease: [0, 0, 0.2, 1] }}
      className={cn("flex flex-col items-center justify-center py-14 px-4 text-center", className)}
    >
      <div className="mb-4 flex items-center justify-center w-14 h-14 rounded-2xl bg-muted text-muted-foreground">
        <Icon size={24} strokeWidth={1.5} />
      </div>
      <p className="text-sm font-semibold text-foreground mb-1">{title}</p>
      {description && (
        <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">{description}</p>
      )}
      {action && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="mt-5"
        >
          {action}
        </motion.div>
      )}
    </motion.div>
  );
}
