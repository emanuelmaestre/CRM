import { requirePageAuth } from "@/shared/lib/auth/session";
import pagesConfig from "@/config/pages.json";
import { AuditoriaLista } from "./auditoria-lista";

export const metadata = { title: pagesConfig.auditoria.metadataTitle };

export default async function AuditoriaPage() {
  await requirePageAuth(["admin"]);
  return <AuditoriaLista />;
}
