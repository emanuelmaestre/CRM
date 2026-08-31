import { Suspense } from "react";
import { AvisoQualidadeDados } from "@/modules/canais/ui/aviso-qualidade-dados";
import { requirePageRoute } from "@/shared/lib/auth/session";
import { QualidadeDadosProvider } from "@/modules/canais/ui/qualidade-dados-contexto";

export default async function EstoqueLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePageRoute("/estoque");
  return <QualidadeDadosProvider pagina="/estoque" aviso={<Suspense fallback={<p className="m-4 text-sm">Verificando integridade dos dados…</p>}><AvisoQualidadeDados orgId={ctx.orgId} /></Suspense>}>
    {children}
  </QualidadeDadosProvider>;
}
