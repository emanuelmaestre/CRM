import { requirePageRoute } from "@/shared/lib/auth/session";

export default async function NovoProdutoLayout({ children }: { children: React.ReactNode }) {
  await requirePageRoute("/estoque/novo");
  return children;
}
