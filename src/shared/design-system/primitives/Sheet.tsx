"use client";

import { Drawer } from "vaul";
import { cn } from "../cn";

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
}

/**
 * Bottom sheet com arraste 1:1, rubber-banding nas bordas e projeção de
 * momentum ao soltar — comportamento nativo do vaul. Reservado para telas
 * estreitas onde um painel lateral não cabe (ver uso em InboxCliente).
 */
export function Sheet({ open, onOpenChange, children, className }: SheetProps) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
        <Drawer.Content
          className={cn(
            "material-thick fixed inset-x-0 bottom-0 z-50 flex max-h-[min(88vh,88dvh)] flex-col rounded-t-[1.25rem] pb-[env(safe-area-inset-bottom)] outline-none",
            className
          )}
        >
          <div className="mx-auto mt-2.5 mb-1 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/30" />
          <Drawer.Title className="sr-only">Detalhe</Drawer.Title>
          <div className="flex-1 overflow-hidden flex flex-col">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
