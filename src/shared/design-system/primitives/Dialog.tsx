"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "../cn";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Ocupa a tela inteira em vez da caixa centralizada. Para conteúdo que
   *  explica algo por inteiro — várias seções, listas, uma conta fechando no
   *  fim: na caixa centralizada isso vira rolagem dentro de rolagem, e a
   *  pessoa perde de vista onde estava. Em tela cheia o cabeçalho fica fixo,
   *  só o miolo rola, e o texto continua numa coluna de largura legível em
   *  vez de esticar de ponta a ponta do monitor. */
  fullscreen?: boolean;
}

export function Dialog({ open, onOpenChange, title, description, children, className, fullscreen }: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=open]:animate-in" />
        <DialogPrimitive.Content
          className={cn(
            fullscreen
              ? "fixed inset-0 z-50 flex flex-col overflow-hidden border-0 bg-card outline-none pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]"
              : "fixed inset-x-3 bottom-3 z-50 max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-[1.25rem] border border-border bg-card p-4 shadow-xl outline-none sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[calc(100%-2rem)] sm:max-w-sm sm:-translate-x-1/2 sm:-translate-y-1/2 sm:p-6",
            className,
          )}
        >
          <div
            className={cn(
              fullscreen
                ? "shrink-0 border-b border-border px-4 py-4 pr-14 sm:px-8 sm:py-5"
                : "mb-4 pr-10",
            )}
          >
            <div className={cn(fullscreen && "mx-auto w-full max-w-5xl")}>
              <DialogPrimitive.Title className={cn("font-semibold text-foreground", fullscreen ? "text-lg sm:text-xl" : "text-base")}>
                {title}
              </DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
          </div>
          <DialogPrimitive.Close asChild>
            <button
              type="button"
              aria-label="Fechar"
              className={cn(
                "absolute inline-flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                fullscreen ? "right-3 top-[calc(env(safe-area-inset-top)+0.75rem)] sm:right-5" : "right-2.5 top-2.5",
              )}
            >
              <X size={fullscreen ? 20 : 16} />
            </button>
          </DialogPrimitive.Close>
          {fullscreen ? (
            // Só o miolo rola: o título continua visível enquanto se percorre
            // a explicação, que é o que perde a pessoa quando o cabeçalho sobe
            // junto. A coluna limitada existe porque linha de texto ocupando
            // 1.900px de monitor não se lê — se perde a volta para a linha
            // seguinte.
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8 sm:py-6">
              <div className="mx-auto w-full max-w-5xl">{children}</div>
            </div>
          ) : children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
