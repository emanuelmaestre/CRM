import Link from "next/link";
import { ArrowLeft, SearchX } from "lucide-react";
import { ElisaLimaLogo } from "@/shared/design-system/primitives/ElisaLimaLogo";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <section className="w-full max-w-lg rounded-[1.5rem] border border-border bg-card p-6 text-center shadow-[0_8px_32px_rgba(14,15,19,.08)] sm:p-10">
        <ElisaLimaLogo variant="login" />
        <div className="mx-auto mt-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <SearchX size={24} strokeWidth={1.6} aria-hidden="true" />
        </div>
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Erro 404</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">Página não encontrada</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
          O endereço pode ter mudado ou não está disponível para o seu acesso.
        </p>
        <Link
          href="/metricas"
          className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold text-white shadow-sm"
          style={{ background: "var(--gradient-signature)" }}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Voltar ao início
        </Link>
      </section>
    </main>
  );
}
