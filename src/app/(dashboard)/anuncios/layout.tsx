import { requirePageRoute } from "@/shared/lib/auth/session";

export default async function AnunciosLayout({ children }: { children: React.ReactNode }) {
  await requirePageRoute("/anuncios");
  return children;
}
