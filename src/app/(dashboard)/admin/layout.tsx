import { requirePageRoute } from "@/shared/lib/auth/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requirePageRoute("/admin");
  return children;
}
