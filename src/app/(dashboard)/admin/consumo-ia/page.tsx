import { requirePageRoute } from "@/shared/lib/auth/session";
import { obterConsumoDetalhado } from "@/modules/ai/application/ai.service";
import { ConsumoIaPainel } from "./consumo-ia-painel";

export default async function ConsumoIaPage() {
  const contexto = await requirePageRoute("/admin/consumo-ia");
  const data = await obterConsumoDetalhado(contexto.orgId);
  return <ConsumoIaPainel data={data} />;
}
