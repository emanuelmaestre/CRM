import { requirePageRoute } from "@/shared/lib/auth/session";

export default async function EstoqueLayout({ children }: { children: React.ReactNode }) {
  await requirePageRoute("/estoque");
  return <>{children}</>;
}
