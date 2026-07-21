"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, Package, ShoppingCart, MessageSquare,
} from "lucide-react";
import { cn } from "@/shared/design-system/cn";

const items = [
  { href: "/dashboard", label: "Painel", icon: LayoutDashboard },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/estoque", label: "Estoque", icon: Package },
  { href: "/vendas", label: "Vendas", icon: ShoppingCart },
  { href: "/inbox", label: "Mensagens", icon: MessageSquare },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <div className="flex items-center justify-around px-2 py-2">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-col items-center gap-0.5 px-3 py-2 rounded-[0.75rem] min-w-[44px] min-h-[44px] transition-colors",
              active ? "text-foreground" : "text-muted-foreground"
            )}
          >
            <item.icon
              size={20}
              strokeWidth={active ? 2 : 1.75}
              className={active ? "text-foreground" : ""}
            />
            <span className="text-[10px] font-medium">{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
