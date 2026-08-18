"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Popover from "@radix-ui/react-popover";
import { cn } from "@/shared/design-system/cn";
import { createClient } from "@/shared/lib/supabase/client";
import { getIcon } from "@/shared/config/icon-registry";
import navigationConfig from "@/config/navigation.json";
import appConfig from "@/config/app.json";
import { nomePerfil, type Perfil } from "@/shared/lib/auth/authorization";
import { isModuloId, type ModuloId } from "@/config/modulos";
import { ElisaLimaLogo } from "@/shared/design-system/primitives/ElisaLimaLogo";
import { tint } from "@/shared/design-system/color";
import { springs, stagger, variantes, fadeUp } from "@/shared/design-system/motion-variants";
import { automacaoPorChave, CATEGORIA_COR_AUTOMACAO } from "@/shared/lib/whatsapp/catalogo-automacoes";
import { actionListarNotificacoes } from "./notificacoes-actions";

const BellIcon = getIcon(navigationConfig.utilities.notifications.icon);
const SettingsIcon = getIcon(navigationConfig.utilities.settings.icon);
const LogoutIcon = getIcon(navigationConfig.utilities.logout.icon);

const CHAVE_VISTAS_EM = "elisa-lima:notificacoes-vistas-em";
const INTERVALO_POLL_MS = 90_000;

type Notificacao = Awaited<ReturnType<typeof actionListarNotificacoes>>[number];

function tempoRelativo(iso: string): string {
  const minutos = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutos < 1) return "agora mesmo";
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `há ${horas}h`;
  const dias = Math.round(horas / 24);
  return dias === 1 ? "ontem" : `há ${dias} dias`;
}

function NotificationBell() {
  const reduzir = useReducedMotion();
  const [aberto, setAberto] = useState(false);
  const [notificacoes, setNotificacoes] = useState<Notificacao[] | null>(null);
  const [vistasEm, setVistasEm] = useState(() =>
    typeof window === "undefined" ? 0 : Number(window.localStorage.getItem(CHAVE_VISTAS_EM) ?? 0),
  );

  useEffect(() => {
    const carregar = () => actionListarNotificacoes().then(setNotificacoes).catch(() => setNotificacoes([]));
    carregar();
    const intervalo = window.setInterval(carregar, INTERVALO_POLL_MS);
    return () => window.clearInterval(intervalo);
  }, []);

  const naoLidas = notificacoes?.filter((n) => new Date(n.criadoEm).getTime() > vistasEm).length ?? 0;

  function abrir(valor: boolean) {
    setAberto(valor);
    if (valor) {
      const agora = Date.now();
      window.localStorage.setItem(CHAVE_VISTAS_EM, String(agora));
      // Só zera o número depois de fechar — sumir o badge no instante do
      // clique, com o painel ainda abrindo, faria parecer que a lista que
      // a pessoa está prestes a ler já não tinha nada de novo.
      window.setTimeout(() => setVistasEm(agora), 400);
    }
  }

  return (
    <Popover.Root open={aberto} onOpenChange={abrir}>
      <Popover.Trigger asChild>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          aria-label={navigationConfig.utilities.notifications.label}
          aria-expanded={aberto}
          className="relative hidden h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:flex"
        >
          <BellIcon size={15} strokeWidth={1.75} />
          <AnimatePresence>
            {naoLidas > 0 && (
              <motion.span
                key="badge"
                initial={reduzir ? false : { scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={springs.settleFast}
                className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-black text-white"
                style={{ background: "var(--destructive)" }}
              >
                {naoLidas > 9 ? "9+" : naoLidas}
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-card p-0 shadow-xl outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <p className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">Notificações</p>

          {notificacoes === null ? (
            <div className="space-y-3 p-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <div className="h-8 w-8 shrink-0 rounded-full bg-muted" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="h-2.5 w-3/4 rounded-full bg-muted" />
                    <div className="h-2 w-1/2 rounded-full bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : notificacoes.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhuma notificação nova.</p>
          ) : (
            <motion.ul variants={stagger} initial="hidden" animate="show" className="max-h-[22rem] divide-y divide-border overflow-y-auto">
              {notificacoes.map((n) => {
                const info = automacaoPorChave(n.tipo);
                if (!info) return null;
                const cor = CATEGORIA_COR_AUTOMACAO[info.categoria];
                return (
                  <motion.li key={n.id} variants={variantes(reduzir, fadeUp)} className="flex items-start gap-2.5 px-4 py-2.5">
                    <span
                      className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                      style={{ background: tint(cor, 12), color: cor }}
                    >
                      <info.icone size={15} strokeWidth={1.75} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-bold text-foreground">
                        {info.titulo}
                        {n.empresa && <span className="font-medium text-muted-foreground"> · {n.empresa}</span>}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{tempoRelativo(n.criadoEm)}</p>
                    </div>
                  </motion.li>
                );
              })}
            </motion.ul>
          )}

          <Link
            href="/configuracoes"
            className="flex items-center justify-center border-t border-border px-4 py-2.5 text-[11px] font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Ver todas as automações →
          </Link>
          <Popover.Arrow className="fill-card" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function TopNav({ perfil, cargo, nome, email, modulosVisiveis }: { perfil: Perfil; cargo: string | null; nome: string; email: string; modulosVisiveis: readonly ModuloId[] }) {
  const rotuloCargo = cargo || nomePerfil(perfil);
  const pathname = usePathname();
  const router   = useRouter();
  const reduzir  = useReducedMotion();
  const initials = nome.split(/\s+/).slice(0, 2).map((word) => word[0]?.toUpperCase() ?? "").join("")
    || email[0]?.toUpperCase()
    || "?";
  const items = navigationConfig.items.filter((item) => isModuloId(item.id) && modulosVisiveis.includes(item.id));

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
                  "relative flex h-14 min-w-11 items-center justify-center gap-1.5 px-2 text-sm font-medium transition-colors xl:px-3",
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
        <NotificationBell />

        {/* Settings */}
        {modulosVisiveis.includes("configuracoes") && (
          <motion.div whileHover={{ scale: 1.02 }} transition={{ duration: 0.15, ease: [0, 0, 0.2, 1] }}>
            <Link
              href={navigationConfig.utilities.settings.href}
              aria-label={navigationConfig.utilities.settings.label}
              className={cn(
                "hidden h-11 w-11 items-center justify-center rounded-lg transition-colors md:flex",
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
              title={`${nome} · ${rotuloCargo}`}
              aria-label={`Abrir menu de ${nome}`}
              className="flex h-11 min-w-11 items-center gap-2 rounded-lg px-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
                <p className="truncate text-xs text-muted-foreground">{rotuloCargo} · {email}</p>
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
