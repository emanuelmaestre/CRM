import { requirePageRoute } from "@/shared/lib/auth/session";

export default async function AvaliacoesLayout({ children }: { children: React.ReactNode }) {
  await requirePageRoute("/avaliacoes");
  return <>{children}</>;
}
