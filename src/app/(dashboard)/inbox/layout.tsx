import { requirePageRoute } from "@/shared/lib/auth/session";

export default async function InboxLayout({ children }: { children: React.ReactNode }) {
  await requirePageRoute("/inbox");
  return children;
}
