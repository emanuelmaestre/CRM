import { requirePageRoute } from "@/shared/lib/auth/session";

export default async function ConfiguracoesLayout({ children }: { children: React.ReactNode }) {
  await requirePageRoute("/configuracoes");
  return children;
}
