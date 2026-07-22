import Link from "next/link";
import pagesConfig from "@/config/pages.json";
import { cn } from "@/shared/design-system/cn";

export function VendasTabs({ active }: { active: "funil" | "tarefas" | "agenda" }) {
  return (
    <nav aria-label="Operação comercial" className="mb-6 flex overflow-x-auto rounded-xl border border-border bg-card p-1">
      {pagesConfig.vendas.tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          aria-current={tab.id === active ? "page" : undefined}
          className={cn(
            "min-h-11 min-w-24 flex-1 rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition-colors",
            tab.id === active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
