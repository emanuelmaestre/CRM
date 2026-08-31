import { Suspense } from "react";
import { AvisoQualidadeDados } from "@/modules/canais/ui/aviso-qualidade-dados";
import { requirePageRoute } from "@/shared/lib/auth/session";
import { QualidadeDadosProvider } from "@/modules/canais/ui/qualidade-dados-contexto";

export default async function VendasLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePageRoute("/vendas");
  return <QualidadeDadosProvider pagina="/vendas" aviso={<Suspense fallback={<p className="m-4 text-sm">Verificando integridade dos dados…</p>}><AvisoQualidadeDados orgId={ctx.orgId} /></Suspense>}>
    {children}
  </QualidadeDadosProvider>;
}
