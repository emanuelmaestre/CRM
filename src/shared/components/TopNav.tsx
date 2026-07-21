"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Users, Package, ShoppingCart,
  MessageSquare, BarChart2, Settings, LogOut, Bell, Search,
} from "lucide-react";
import { cn } from "@/shared/design-system/cn";
import { createClient } from "@/shared/lib/supabase/client";

const navItems = [
  { href: "/dashboard",  label: "Painel",     icon: LayoutDashboard },
  { href: "/clientes",   label: "Clientes",   icon: Users },
  { href: "/estoque",    label: "Estoque",    icon: Package },
  { href: "/vendas",     label: "Vendas",     icon: ShoppingCart },
  { href: "/inbox",      label: "Mensagens",  icon: MessageSquare },
  { href: "/relatorios", label: "Relatórios", icon: BarChart2 },
];

export function TopNav() {
  const pathname = usePathname();
  const router   = useRouter();
  const [initials, setInitials] = useState("?");
  const [bell, setBell] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      const email = data.user?.email ?? "";
      const name  = data.user?.user_metadata?.full_name ?? email;
      setInitials(
        name.split(/\s+/).slice(0, 2).map((w: string) => w[0]?.toUpperCase() ?? "").join("") ||
        email[0]?.toUpperCase() || "?"
      );
    });
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();
  }

  return (
    <motion.header
      initial={{ y: -56, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
      className="fixed top-0 inset-x-0 z-30 h-14 bg-card/90 backdrop-blur-md border-b border-border flex items-center px-4 sm:px-6 gap-4"
    >
      {/* Logo */}
      <Link href="/dashboard" className="flex items-center gap-2 shrink-0 group">
        <motion.span
          whileHover={{ scale: 1.05 }}
          transition={{ type: "spring", stiffness: 400, damping: 20 }}
          className="text-lg font-bold tracking-tight leading-none"
          style={{
            fontFamily: "var(--font-sora)",
            background: "var(--gradient-signature)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          CRM
        </motion.span>
        <div className="flex gap-1.5">
          <span className="text-[9px] font-bold uppercase tracking-widest text-foreground/50">KARZI</span>
          <span className="text-[9px] font-bold uppercase tracking-widest text-foreground/50">WUWU</span>
        </div>
      </Link>

      {/* Nav links */}
      <nav className="hidden md:flex items-center gap-0 flex-1">
        {navItems.map((item, i) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <motion.div
              key={item.href}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 + 0.15, duration: 0.25 }}
            >
              <Link
                href={item.href}
                className={cn(
                  "relative flex items-center gap-1.5 px-3 text-sm font-medium transition-colors h-14",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <motion.span
                  animate={{ opacity: active ? 1 : 0.7 }}
                  whileHover={{ opacity: 1 }}
                >
                  <item.icon size={14} strokeWidth={active ? 2.25 : 1.75} />
                </motion.span>
                {item.label}

                {/* Active underline com shared layout animation */}
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute bottom-0 inset-x-0 h-[2px] bg-foreground"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
              </Link>
            </motion.div>
          );
        })}
      </nav>

      {/* Right */}
      <div className="ml-auto flex items-center gap-1.5">
        {/* Search */}
        <motion.div
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4, duration: 0.25 }}
          className="hidden lg:flex items-center gap-2 h-8 px-3 rounded-lg bg-muted text-muted-foreground text-sm cursor-pointer hover:bg-muted/80 transition-colors group"
        >
          <Search size={13} strokeWidth={2} className="group-hover:scale-110 transition-transform" />
          <span className="text-xs">Buscar…</span>
          <kbd className="ml-1 text-[10px] bg-card border border-border rounded px-1 py-0.5 leading-none">⌘K</kbd>
        </motion.div>

        {/* Bell */}
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setBell(b => !b)}
          className="hidden md:flex relative w-8 h-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <Bell size={15} strokeWidth={1.75} />
          <AnimatePresence>
            {bell && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[var(--karzi)]"
              />
            )}
          </AnimatePresence>
        </motion.button>

        {/* Settings */}
        <motion.div whileHover={{ rotate: 45 }} transition={{ type: "spring", stiffness: 300 }}>
          <Link
            href="/configuracoes"
            className={cn(
              "hidden md:flex w-8 h-8 items-center justify-center rounded-lg transition-colors",
              pathname === "/configuracoes"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            <Settings size={15} strokeWidth={1.75} />
          </Link>
        </motion.div>

        <div className="hidden md:block w-px h-5 bg-border mx-0.5" />

        {/* Avatar */}
        <motion.button
          onClick={handleLogout}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          title="Sair"
          className="flex items-center gap-2 h-8 pl-1 pr-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <div className="relative">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
              style={{ background: "var(--gradient-signature)" }}
            >
              {initials}
            </div>
            {/* Status online */}
            <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#1F8A4C] border-2 border-card" />
          </div>
          <LogOut size={13} strokeWidth={1.75} className="hidden md:block" />
        </motion.button>
      </div>
    </motion.header>
  );
}
