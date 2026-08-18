"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Popover from "@radix-ui/react-popover";
import { cn } from "@/shared/design-system/cn";
import { createClient } from "@/shared/lib/supabase/client";
import { getIcon } from "@/shared/config/icon-registry";
import navigationConfig from "@/config/navigation.json";
import appConfig from "@/config/app.json";
import { nomePerfil, type Perfil } from "@/shared/lib/auth/authorization";
import { ElisaLimaLogo } from "@/shared/design-system/primitives/ElisaLimaLogo";

const BellIcon = getIcon(navigationConfig.utilities.notifications.icon);
const SettingsIcon = getIcon(navigationConfig.utilities.settings.icon);
const LogoutIcon = getIcon(navigationConfig.utilities.logout.icon);

export function TopNav({ perfil, nome, email }: { perfil: Perfil; nome: string; email: string }) {
  const pathname = usePathname();
  const router   = useRouter();
  const reduzir  = useReducedMotion();
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
      initial={false}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.28, ease: [0, 0, 0.2, 1] }}
      className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-2 overflow-hidden border-b border-border bg-card/90 px-[clamp(1rem,2vw,1.5rem)] backdrop-blur-md xl:gap-4"
    >
      {/* Logo */}
      <Link href={navigationConfig.homeHref} className="flex items-center shrink-0 group" aria-label={appConfig.logo.homeAriaLabel}>
        <motion.span
          whileHover={{ scale: 1.02 }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
          className="flex items-center"
        >
          <ElisaLimaLogo />
        </motion.span>
      </Link>

      {/* Nav links */}
      <nav className="hidden min-w-0 flex-1 items-center justify-center md:flex">
        {items.map((item, i) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = getIcon(item.icon);
          return (
            <motion.div
              key={item.href}
              initial={reduzir ? false : { opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduzir ? { duration: 0 } : { delay: i * 0.03 + 0.1, duration: 0.2, ease: [0, 0, 0.2, 1] }}
            >
              <Link
                href={item.href}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                title={item.label}
                className={cn(
                  "relative flex h-14 min-w-10 items-center justify-center gap-1.5 px-2 text-sm font-medium transition-colors xl:px-3",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <motion.span
                  animate={{ opacity: active ? 1 : 0.7 }}
                  whileHover={{ opacity: 1 }}
                >
                  <Icon size={14} strokeWidth={active ? 2.25 : 1.75} />
                </motion.span>
                <span className="hidden whitespace-nowrap xl:inline">{item.label}</span>

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
        <Popover.Root open={bell} onOpenChange={setBell}>
          <Popover.Trigger asChild>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              aria-label={navigationConfig.utilities.notifications.label}
              aria-expanded={bell}
              className="relative hidden h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:flex"
            >
              <BellIcon size={15} strokeWidth={1.75} />
            </motion.button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              align="end"
              sideOffset={8}
              className="z-50 w-72 rounded-xl border border-border bg-card p-4 shadow-xl outline-none"
            >
              <p className="text-sm font-semibold text-foreground">Notificações</p>
              <p className="mt-1 text-sm text-muted-foreground">Nenhuma notificação nova.</p>
              <Popover.Arrow className="fill-card" />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>

        {/* Settings */}
        {navigationConfig.utilities.settings.profiles.includes(perfil) && (
          <motion.div whileHover={{ scale: 1.02 }} transition={{ duration: 0.15, ease: [0, 0, 0.2, 1] }}>
            <Link
              href={navigationConfig.utilities.settings.href}
              aria-label={navigationConfig.utilities.settings.label}
              className={cn(
                "hidden h-10 w-10 items-center justify-center rounded-lg transition-colors md:flex",
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
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              title={`${nome} · ${nomePerfil(perfil)}`}
              aria-label={`Abrir menu de ${nome}`}
              className="flex h-10 min-w-10 items-center gap-2 rounded-lg px-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <div className="relative">
                <div
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                  style={{ background: "var(--gradient-signature)" }}
                >
                  {initials}
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border-2 border-card bg-success" />
              </div>
            </motion.button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={8}
              className="z-50 min-w-56 rounded-xl border border-border bg-card p-1.5 shadow-xl outline-none"
            >
              <div className="px-3 py-2">
                <p className="truncate text-sm font-semibold text-foreground">{nome}</p>
                <p className="truncate text-xs text-muted-foreground">{nomePerfil(perfil)} · {email}</p>
              </div>
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
              <DropdownMenu.Item
                onSelect={handleLogout}
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm font-medium text-destructive outline-none transition-colors focus:bg-destructive/10"
              >
                <LogoutIcon size={15} strokeWidth={1.9} />
                {navigationConfig.utilities.logout.label}
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </motion.header>
  );
}
