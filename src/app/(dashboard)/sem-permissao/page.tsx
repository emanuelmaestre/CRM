import Link from "next/link";
import permissionsConfig from "@/config/permissions.json";

export default function SemPermissaoPage() {
  return (
    <section className="mx-auto max-w-xl rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">Acesso restrito</p>
      <h1 className="mt-3 text-2xl font-bold text-foreground">
        {permissionsConfig.messages.forbiddenTitle}
      </h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {permissionsConfig.messages.forbiddenDescription}
      </p>
      <Link
        href="/dashboard"
        className="mt-6 inline-flex h-11 items-center rounded-xl bg-foreground px-5 text-sm font-semibold text-background"
      >
        {permissionsConfig.messages.backToDashboard}
      </Link>
    </section>
  );
}
