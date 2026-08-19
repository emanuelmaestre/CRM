import { Suspense } from "react";
import { Mosaico } from "./mosaico";
import { actionObterSaudeLoja } from "./actions";
import { actionContarPedidosPorCanal, actionContarPedidosPorMarca } from "../vendas/actions";
import pagesConfig from "@/config/pages.json";

export const metadata = { title: pagesConfig.metricas.metadataTitle };

/* O mosaico soma oito buscas independentes, todas feitas pelo navegador
   depois que o JavaScript carrega. As três resolvidas aqui são as que a
   pessoa vê primeiro — as pílulas de filtro e o card de Saúde da loja — e
   agora viajam dentro do HTML da primeira resposta. As outras cinco (cada
   card no seu ritmo) continuam como estavam.

   Saúde vai sem `inicio`/`fim` de propósito: é assim que o componente faz na
   primeira carga, e o serviço aplica a própria janela padrão nos dois casos —
   se aqui fosse diferente, o resultado pré-buscado não bateria com a chave que
   o mosaico espera e a busca seria refeita à toa.

   Falha não derruba a página: sem dado inicial cada parte cai no caminho
   antigo e busca pelo navegador, exatamente como fazia antes. */
export default async function MetricasPage() {
  const [marcas, canais, saude] = await Promise.all([
    actionContarPedidosPorMarca().catch(() => []),
    actionContarPedidosPorCanal().catch(() => []),
    actionObterSaudeLoja({}).catch(() => null),
  ]);

  return (
    <div>
      {/* O mosaico lê o card aberto de `?card=` — useSearchParams exige um
          limite de Suspense para não forçar a página inteira a ser dinâmica. */}
      <Suspense fallback={null}>
        <Mosaico marcasIniciais={marcas} canaisIniciais={canais} saudeInicial={saude} />
      </Suspense>
    </div>
  );
}
