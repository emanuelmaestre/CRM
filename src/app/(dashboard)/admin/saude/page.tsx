import { obterPainelSaude } from "@/modules/canais/application/saude.service";
import { requirePageRoute } from "@/shared/lib/auth/session";
import { SaudePainel } from "./saude-painel";

export default async function SaudePage() {
  const contexto = await requirePageRoute("/admin/saude");
  const data = await obterPainelSaude(contexto.orgId);
  return <SaudePainel data={data} />;
}
