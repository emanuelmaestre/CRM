"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/shared/design-system/cn";
import { getIcon } from "@/shared/config/icon-registry";
import navigationConfig from "@/config/navigation.json";
import type { Perfil } from "@/shared/lib/auth/authorization";

const MORE = navigationConfig.utilities.more;
const MoreIcon = getIcon(MORE.icon);

type Item = (typeof navigationConfig.items)[number];

function temPrioridade(item: Item): item is Item & { mobilePriority: number } {
  return typeof (item as { mobilePriority?: number }).mobilePriority === "number";
}

/**
 * Barra inferior do celular. O PRD §2.2 pede 4 itens fixos + "mais": os fixos
 * saem do `mobilePriority` de navigation.json entre os itens visíveis ao perfil,
 * e todo o restante — inclusive o que nunca é fixo — cai no painel "mais".
 */
export function BottomNav({ perfil }: { perfil: Perfil }) {
  const pathname = usePathname();
  const [maisAberto, setMaisAberto] = useState(false);
  const [pathnameAnterior, setPathnameAnterior] = useState(pathname);

  // Navegar fecha o painel; sem isso ele ficaria aberto sobre a página nova.
  // Ajuste durante o render (não em efeito) para evitar um re-render em cascata.
  if (pathname !== pathnameAnterior) {
    setPathnameAnterior(pathname);
    if (maisAberto) setMaisAberto(false);
  }

  useEffect(() => {
    if (!maisAberto) return;
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === "Escape") setMaisAberto(false); };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [maisAberto]);

  const visiveis = navigationConfig.items.filter((item) => item.profiles.includes(perfil));
  const fixos = visiveis
    .filter(temPrioridade)
    .sort((a, b) => a.mobilePriority - b.mobilePriority)
    .slice(0, navigationConfig.mobilePrimaryCount);
  const idsFixos = new Set(fixos.map((i) => i.id));
  const noMais = visiveis.filter((item) => !idsFixos.has(item.id));

  const ativo = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const algumDoMaisAtivo = noMais.some((item) => ativo(item.href));

  return (
    <>
      <AnimatePresence>
        {maisAberto && (
          <>
            <motion.button
              key="backdrop"
              type="button"
              aria-label={MORE.closeLabel}
              onClick={() => setMaisAberto(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="fixed inset-0 z-40 bg-foreground/20"
            />
            <motion.div
              key="sheet"
              role="dialog"
              aria-label={MORE.sheetAriaLabel}
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 12, opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
              className="fixed inset-x-0 bottom-[calc(var(--bottom-nav-h,64px)+env(safe-area-inset-bottom))] z-50 max-h-[calc(100dvh-5rem-env(safe-area-inset-top))] overflow-y-auto border-t border-border bg-card p-2 pb-3 shadow-[0_-8px_28px_rgba(14,15,19,.12)]"
            >
              <div className="grid grid-cols-2 gap-1 min-[380px]:grid-cols-3">
                {noMais.map((item) => {
                  const Icon = getIcon(item.icon);
                  const on = ativo(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={on ? "page" : undefined}
                      className={cn(
                        "flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-center transition-colors",
                        on ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60",
                      )}
                    >
                      <Icon size={20} strokeWidth={on ? 2.25 : 1.75} />
                      <span className="text-[10px] font-medium leading-tight">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-5 items-center px-1 py-1">
        {fixos.map((item) => {
          const on = ativo(item.href);
          const Icon = getIcon(item.icon);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={on ? "page" : undefined}
              className="relative flex min-h-[48px] min-w-0 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-center"
            >
              <AnimatePresence>
                {on && (
                  <motion.span
                    layoutId="bottom-active"
                    className="absolute inset-x-1 inset-y-1 rounded-xl bg-muted"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
              </AnimatePresence>

              <motion.span
                animate={{ scale: on ? 1.06 : 1, y: 0 }}
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
                className={cn("relative z-10", on ? "text-foreground" : "text-muted-foreground")}
              >
                <Icon size={20} strokeWidth={on ? 2.25 : 1.75} />
              </motion.span>

              <span className={cn(
                "relative z-10 max-w-full truncate text-[10px] font-medium transition-colors",
                on ? "text-foreground" : "text-muted-foreground",
              )}>
                {item.label}
              </span>
            </Link>
          );
        })}

        {noMais.length > 0 && (
          <button
            type="button"
            onClick={() => setMaisAberto((v) => !v)}
            aria-expanded={maisAberto}
            aria-label={MORE.label}
            data-testid="bottom-nav-mais"
            className="relative flex min-h-[48px] min-w-0 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-center"
          >
            {(maisAberto || algumDoMaisAtivo) && (
              <span className="absolute inset-x-1 inset-y-1 rounded-xl bg-muted" />
            )}
            <motion.span
              animate={{ scale: maisAberto ? 1.06 : 1 }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              className={cn(
                "relative z-10",
                maisAberto || algumDoMaisAtivo ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <MoreIcon size={20} strokeWidth={maisAberto || algumDoMaisAtivo ? 2.25 : 1.75} />
            </motion.span>
            <span className={cn(
              "relative z-10 text-[10px] font-medium transition-colors",
              maisAberto || algumDoMaisAtivo ? "text-foreground" : "text-muted-foreground",
            )}>
              {MORE.label}
            </span>
          </button>
        )}
      </div>
    </>
  );
}
