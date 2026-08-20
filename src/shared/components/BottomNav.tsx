"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "@/shared/design-system/cn";
import { getIcon } from "@/shared/config/icon-registry";
import navigationConfig from "@/config/navigation.json";
import { isModuloId, type ModuloId } from "@/config/modulos";

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
export function BottomNav({ modulosVisiveis }: { modulosVisiveis: readonly ModuloId[] }) {
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

  // "clientes" fica escondido do menu pra todo mundo, mas a rota continua
  // funcionando (mesma decisão do TopNav — ver comentário lá).
  const visiveis = navigationConfig.items.filter((item) => isModuloId(item.id) && item.id !== "clientes" && modulosVisiveis.includes(item.id));
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
      <Dialog.Root open={maisAberto} onOpenChange={setMaisAberto}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-foreground/20" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed inset-x-0 bottom-[calc(var(--bottom-nav-h,64px)_+_env(safe-area-inset-bottom))] z-50 max-h-[calc(100dvh_-_5rem_-_env(safe-area-inset-top))] overflow-y-auto border-t border-border bg-card p-2 pb-3 shadow-[0_-8px_28px_rgba(14,15,19,.12)] outline-none"
          >
              <Dialog.Title className="sr-only">{MORE.sheetAriaLabel}</Dialog.Title>
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
                      <span className="text-[11px] font-medium leading-tight">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

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
                "relative z-10 max-w-full truncate text-[10px] font-medium transition-colors min-[360px]:text-[11px]",
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
              "relative z-10 text-[10px] font-medium transition-colors min-[360px]:text-[11px]",
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
