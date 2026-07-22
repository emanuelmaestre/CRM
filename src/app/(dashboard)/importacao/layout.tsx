import { requirePageRoute } from "@/shared/lib/auth/session";

export default async function ImportacaoLayout({ children }: { children: React.ReactNode }) {
  await requirePageRoute("/importacao");
  return children;
}
