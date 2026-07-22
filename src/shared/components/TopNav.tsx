"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/shared/design-system/cn";
import { createClient } from "@/shared/lib/supabase/client";
import { getIcon } from "@/shared/config/icon-registry";
import navigationConfig from "@/config/navigation.json";
import { nomePerfil, type Perfil } from "@/shared/lib/auth/authorization";

const BellIcon = getIcon(navigationConfig.utilities.notifications.icon);
const SettingsIcon = getIcon(navigationConfig.utilities.settings.icon);
const LogoutIcon = getIcon(navigationConfig.utilities.logout.icon);

export function TopNav({ perfil, nome, email }: { perfil: Perfil; nome: string; email: string }) {
  const pathname = usePathname();
  const router   = useRouter();
  const [bell, setBell] = useState(false);
  const initials = nome.split(/\s+/).slice(0, 2).map((word) => word[0]?.toUpperCase() ?? "").join("")
    || email[0]?.toUpperCase()
    || "?";
  const items = navigationConfig.items.filter((item) => item.profiles.includes(perfil));

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();
  }

  return (
    <motion.header
      initial={{ y: -8, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.28, ease: [0, 0, 0.2, 1] }}
      className="fixed top-0 inset-x-0 z-30 h-14 bg-card/90 backdrop-blur-md border-b border-border flex items-center px-4 sm:px-6 gap-4"
    >
      {/* Logo */}
      <Link href={navigationConfig.homeHref} className="flex items-center shrink-0 group" aria-label="Início">
        <motion.span
          whileHover={{ scale: 1.03 }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
          className="flex items-center"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logos/uncao.svg"
            alt="KARZI | WUWU"
            style={{ height: 26, width: "auto", display: "block", objectFit: "contain" }}
          />
        </motion.span>
      </Link>

      {/* Nav links */}
      <nav className="hidden md:flex items-center gap-0 flex-1">
        {items.map((item, i) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = getIcon(item.icon);
          return (
            <motion.div
              key={item.href}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 + 0.1, duration: 0.2, ease: [0, 0, 0.2, 1] }}
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
                  <Icon size={14} strokeWidth={active ? 2.25 : 1.75} />
                </motion.span>
                {item.label}

                {/* Active underline com shared layout animation */}
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute bottom-0 inset-x-0 h-[2px] bg-foreground"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
              </Link>
            </motion.div>
          );
        })}
      </nav>

      {/* Right */}
      <div className="ml-auto flex items-center gap-1.5">

        {/* Bell */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => setBell(b => !b)}
          className="hidden md:flex relative w-8 h-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <BellIcon size={15} strokeWidth={1.75} />
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
        {navigationConfig.utilities.settings.profiles.includes(perfil) && (
          <motion.div whileHover={{ scale: 1.05 }} transition={{ duration: 0.15, ease: [0, 0, 0.2, 1] }}>
            <Link
              href={navigationConfig.utilities.settings.href}
              aria-label={navigationConfig.utilities.settings.label}
              className={cn(
                "hidden md:flex w-8 h-8 items-center justify-center rounded-lg transition-colors",
                pathname === navigationConfig.utilities.settings.href
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <SettingsIcon size={15} strokeWidth={1.75} />
            </Link>
          </motion.div>
        )}


        {/* Avatar */}
        <motion.button
          onClick={handleLogout}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          title={`${nome} · ${nomePerfil(perfil)} · ${navigationConfig.utilities.logout.label}`}
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
          <LogoutIcon size={13} strokeWidth={1.75} className="hidden md:block" />
        </motion.button>
      </div>
    </motion.header>
  );
}
