import { requirePageRoute } from "@/shared/lib/auth/session";
import { getCrudContext } from "@/shared/lib/get-crud-context";
import { listarConferenciasAbertas } from "@/modules/vendas/application/conferencia-financeira.service";
import { ConferenciaFinanceiraPainel } from "./conferencia-financeira-painel";

export default async function ConferenciaFinanceiraPage() {
  await requirePageRoute("/admin/conferencia-financeira");
  const ctx = await getCrudContext();
  const data = await listarConferenciasAbertas(ctx);
  return <ConferenciaFinanceiraPainel data={data} />;
}
