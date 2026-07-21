"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Users, Package, ShoppingCart, MessageSquare,
} from "lucide-react";
import { cn } from "@/shared/design-system/cn";

const items = [
  { href: "/dashboard", label: "Painel",    icon: LayoutDashboard },
  { href: "/clientes",  label: "Clientes",  icon: Users },
  { href: "/estoque",   label: "Estoque",   icon: Package },
  { href: "/vendas",    label: "Vendas",    icon: ShoppingCart },
  { href: "/inbox",     label: "Mensagens", icon: MessageSquare },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <div className="flex items-center justify-around px-2 py-1">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className="relative flex flex-col items-center gap-0.5 px-3 py-2 min-w-[44px] min-h-[44px] justify-center"
          >
            {/* Active background pill */}
            <AnimatePresence>
              {active && (
                <motion.span
                  layoutId="bottom-active"
                  className="absolute inset-x-1 inset-y-1 rounded-xl bg-muted"
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                />
              )}
            </AnimatePresence>

            <motion.span
              animate={{ scale: active ? 1.1 : 1, y: active ? -1 : 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              className={cn("relative z-10", active ? "text-foreground" : "text-muted-foreground")}
            >
              <item.icon size={20} strokeWidth={active ? 2.25 : 1.75} />
            </motion.span>

            <span className={cn(
              "relative z-10 text-[10px] font-medium transition-colors",
              active ? "text-foreground" : "text-muted-foreground"
            )}>
              {item.label}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
