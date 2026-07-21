"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, Package, ShoppingCart,
  MessageSquare, BarChart2, Settings, LogOut,
} from "lucide-react";
import { cn } from "@/shared/design-system/cn";
import { createClient } from "@/shared/lib/supabase/client";
import { useRouter } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "Painel", icon: LayoutDashboard },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/estoque", label: "Estoque", icon: Package },
  { href: "/vendas", label: "Vendas", icon: ShoppingCart },
  { href: "/inbox", label: "Mensagens", icon: MessageSquare },
  { href: "/relatorios", label: "Relatórios", icon: BarChart2 },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();
  }

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-border">
        <span
          className="text-xl font-bold tracking-tight"
          style={{ fontFamily: "var(--font-sora)", background: "var(--gradient-signature)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
        >
          CRM
        </span>
        <div className="flex gap-2 mt-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-foreground">KARZI</span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-foreground">WUWU</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-[0.75rem] text-sm font-medium transition-all duration-160 min-h-[44px]",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted hover:-translate-y-px"
              )}
            >
              <item.icon size={18} strokeWidth={1.75} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-border space-y-0.5">
        <Link
          href="/configuracoes"
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-[0.75rem] text-sm font-medium transition-all duration-160 min-h-[44px]",
            pathname === "/configuracoes"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
        >
          <Settings size={18} strokeWidth={1.75} />
          Configurações
        </Link>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[0.75rem] text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-muted transition-colors min-h-[44px]"
        >
          <LogOut size={18} strokeWidth={1.75} />
          Sair
        </button>
      </div>
    </div>
  );
}
