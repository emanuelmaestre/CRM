import { requirePageRoute } from "@/shared/lib/auth/session";

export default async function RelatoriosLayout({ children }: { children: React.ReactNode }) {
  await requirePageRoute("/relatorios");
  return children;
}
