import permissionsConfig from "@/config/permissions.json";
import appConfig from "@/config/app.json";
import { SignOutButton } from "@/shared/components/SignOutButton";

export default async function AcessoNegadoPage({
  searchParams,
}: {
  searchParams: Promise<{ motivo?: string }>;
}) {
  const { motivo } = await searchParams;
  const inactive = motivo === "INACTIVE";
  const title = inactive
    ? permissionsConfig.messages.inactiveTitle
    : permissionsConfig.messages.notProvisionedTitle;
  const description = inactive
    ? permissionsConfig.messages.inactiveDescription
    : permissionsConfig.messages.notProvisionedDescription;

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4">
      <section className="w-full max-w-lg rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">{appConfig.identityLabel}</p>
        <h1 className="mt-3 text-2xl font-bold text-foreground">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
        <div className="mt-6 flex justify-center">
          <SignOutButton label={permissionsConfig.messages.signOut} />
        </div>
      </section>
    </main>
  );
}
