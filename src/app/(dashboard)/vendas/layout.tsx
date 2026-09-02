import { requirePageRoute } from "@/shared/lib/auth/session";

export default async function VendasLayout({ children }: { children: React.ReactNode }) {
  await requirePageRoute("/vendas");
  return <>{children}</>;
}
