import Link from "next/link";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { legalLoginItems } from "@/shared/legal/legal-documents";

export function LegalLinks() {
  return (
    <section className="mt-6 rounded-lg border border-border bg-card/75 p-3">
      <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
        <ShieldCheck size={14} />
        Documentos de implantação
      </div>
      <div className="grid gap-2">
        {legalLoginItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="group flex min-h-14 items-center gap-3 rounded-lg border border-border bg-background px-3 py-2 transition-colors hover:bg-muted/55"
            >
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Icon size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-foreground">{item.title}</span>
                <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{item.description}</span>
              </span>
              <ArrowUpRight size={15} className="shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
            </Link>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 px-1 text-[11px] font-semibold text-muted-foreground">
        <Link href="/terms" className="hover:text-foreground">Terms</Link>
        <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
      </div>
    </section>
  );
}
