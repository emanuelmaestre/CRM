import { Suspense } from "react";
import { AvisoQualidadeDados } from "@/modules/canais/ui/aviso-qualidade-dados";
import { requirePageRoute } from "@/shared/lib/auth/session";

export default async function AvaliacoesLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePageRoute("/avaliacoes");
  return <><Suspense fallback={<p className="m-4 text-sm">Verificando integridade dos dados…</p>}><AvisoQualidadeDados orgId={ctx.orgId} /></Suspense>{children}</>;
}
