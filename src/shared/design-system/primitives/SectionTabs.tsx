import Link from "next/link";
import { cn } from "@/shared/design-system/cn";

export interface SectionTab {
  id: string;
  href: string;
  label: string;
}

interface Props {
  tabs: readonly SectionTab[];
  active: string;
  ariaLabel: string;
}

/**
 * Abas de navegação de um grupo de páginas (ex.: Vendas → Funil · Pedidos,
 * Tarefas → Tarefas · Agenda). Os itens vêm do JSON de configuração da página,
 * então acrescentar ou remover aba não exige tocar em componente.
 */
export function SectionTabs({ tabs, active, ariaLabel }: Props) {
  return (
    <nav
      aria-label={ariaLabel}
      className="mb-6 flex overflow-x-auto rounded-xl border border-border bg-card p-1"
    >
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          aria-current={tab.id === active ? "page" : undefined}
          className={cn(
            "min-h-11 min-w-24 flex-1 rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition-colors",
            tab.id === active
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
