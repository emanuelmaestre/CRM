import { requirePageRoute } from "@/shared/lib/auth/session";
import { CanalAnunciosProvider } from "./canal-anuncios";

export default async function AnunciosLayout({ children }: { children: React.ReactNode }) {
  await requirePageRoute("/anuncios");
  // O canal escolhido (Mercado Livre / Shopee) vive aqui, no layout, pra
  // sobreviver à navegação entre as telas do módulo — ver canal-anuncios.tsx.
  return <CanalAnunciosProvider>{children}</CanalAnunciosProvider>;
}
