import Link from "next/link";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { legalLoginItems } from "@/shared/legal/legal-documents";

export function LegalLinks() {
  return (
    <section className="mt-5 rounded-lg bg-card/45 px-3 py-3">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
        <ShieldCheck size={12} strokeWidth={2} />
        Documentos de implantação
      </div>
      <div className="divide-y divide-border/70">
        {legalLoginItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="group flex min-h-11 items-center gap-2.5 rounded-md px-1 py-2 transition-colors hover:bg-muted/45"
            >
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/70 text-muted-foreground">
                <Icon size={13} strokeWidth={2} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-foreground">{item.title}</span>
                <span className="mt-0.5 block truncate text-[11px] leading-snug text-muted-foreground">{item.description}</span>
              </span>
              <ArrowUpRight size={13} className="shrink-0 text-muted-foreground/65 transition-colors group-hover:text-foreground" />
            </Link>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 px-1 text-[10.5px] font-medium text-muted-foreground">
        <Link href="/terms" className="hover:text-foreground">Terms</Link>
        <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
      </div>
    </section>
  );
}
