import { medirTempo } from "@/shared/lib/observability/medir-tempo";
import { AvaliacoesCliente } from "./avaliacoes-cliente";
import { requirePageAuth } from "@/shared/lib/auth/session";
import { listarAvaliacoesDoCache } from "@/modules/canais/application/avaliacoes-cache";

/* Antes o navegador abria a tela vazia e só então chamava /api/ml/avaliacoes
   para preencher a lista. Como essa rota só lê o cache que o cron A28 mantém
   no banco (nenhuma chamada ao Mercado Livre na hora), dá para ler o mesmo
   cache aqui e mandar as avaliações dentro do HTML — a lista aparece junto
   com a página em vez de depois dela.

   Falha não derruba a tela: sem dado inicial o componente cai no caminho
   antigo e busca pela rota, exatamente como fazia antes. */
export default async function AvaliacoesPage() {
  // `requirePageAuth` e não `getAuthContext`: página e layout renderizam em
  // paralelo, então esta função pode rodar antes de o layout decidir o
  // redirecionamento. Sem sessão, `getAuthContext` lançaria erro (tela de 500)
  // em vez de mandar para o login.
  const { orgId } = await requirePageAuth();
  const { items } = await medirTempo(
    "avaliacoes/cache",
    () => listarAvaliacoesDoCache(orgId),
  ).catch(() => ({ items: [] }));

  return <AvaliacoesCliente itensIniciais={items} />;
}
