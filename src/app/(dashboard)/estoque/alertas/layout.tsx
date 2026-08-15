import { requirePageRoute } from "@/shared/lib/auth/session";

/* /estoque é liberado para vendedor, mas /estoque/alertas não: configurar a
 * régua grava estoque mínimo em lote, o que é operação gerencial (ver
 * permissions.json e o caso "vendedor · /estoque/alertas · false" em
 * authorization.test.ts).
 *
 * Esse contrato existia só no JSON e no teste da função pura `podeAcessarRota`
 * — a rota em si nunca o chamava. O layout do grupo (dashboard) faz
 * `requirePageAuth()` sem argumento, que exige login mas não perfil, e a
 * página de alertas é um client component sem checagem de servidor. Resultado:
 * o teste passava enquanto a rota seguia aberta a qualquer usuário logado.
 * As escritas nunca estiveram expostas (`simularReguaEstoque` e
 * `aplicarReguaEstoque` têm `assertPerfil` no serviço), mas o vendedor abria o
 * assistente inteiro para só tomar erro no fim. */
export default async function EstoqueAlertasLayout({ children }: { children: React.ReactNode }) {
  await requirePageRoute("/estoque/alertas");
  return children;
}
