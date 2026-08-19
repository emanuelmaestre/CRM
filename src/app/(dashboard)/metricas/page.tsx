import { Suspense } from "react";
import { Mosaico } from "./mosaico";
import {
  actionListarInsights, actionListarSugestoes,
  actionObterDesempenhoPublicacoes, actionObterPosVenda, actionObterSaudeLoja,
} from "./actions";
import { actionContarPedidosPorCanal, actionContarPedidosPorMarca } from "../vendas/actions";
import pagesConfig from "@/config/pages.json";

export const metadata = { title: pagesConfig.metricas.metadataTitle };

function diasAtras(total: number): string {
  const data = new Date();
  data.setDate(data.getDate() - total);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}
const HOJE = diasAtras(0);

/* O mosaico soma oito buscas independentes, quase todas locais ao banco —
   só Reclamações depende da API do Mercado Livre (lenta, já cacheada por 90s
   em painel/actions.ts) e por isso fica de fora daqui: não vale prender a
   primeira resposta da página nela. As outras sete eram disparadas pelo
   navegador uma a uma, cada uma como sua própria requisição de Server
   Action — e cada requisição paga de novo a autenticação (ver
   getAuthContext em auth/session.ts) além de competir pela conexão única do
   banco (ver getDatabaseClientOptions em db/index.ts). Buscando tudo aqui
   dentro de `Promise.all`, tudo isso roda numa única requisição.

   Cada busca usa o mesmo argumento que o efeito correspondente usa na
   primeira carga do navegador (ver mosaico.tsx), para o resultado pré-buscado
   bater com a chave que o mosaico monta e a busca não ser refeita à toa:
   Saúde e Pós-venda sem `inicio`/`fim` (o serviço aplica os últimos 30 dias
   por padrão); a janela "anterior" replica a mesma duração, imediatamente
   anterior a essa, que o card Evolução usa.

   Publicações depende de saber a primeira marca, que só se sabe depois da
   Saúde responder — por isso sai de um segundo `await`, não do mesmo
   `Promise.all`; ainda assim é uma consulta local rápida, não custa a
   navegação.

   Falha não derruba a página: sem dado inicial cada parte cai no caminho
   antigo e busca pelo navegador, exatamente como fazia antes. */
export default async function MetricasPage() {
  const [marcas, canais, saude, posVenda, insights, sugestoes] = await Promise.all([
    actionContarPedidosPorMarca().catch(() => []),
    actionContarPedidosPorCanal().catch(() => []),
    actionObterSaudeLoja({}).catch(() => null),
    actionObterPosVenda({}).catch(() => null),
    actionListarInsights().catch(() => []),
    actionListarSugestoes().catch(() => []),
  ]);

  // Mesma conta que o efeito de "anterior" faz em mosaico.tsx: sem inicio/fim
  // escolhido, a janela atual é hoje-29..hoje, e a anterior é a mesma duração
  // (30 dias) imediatamente antes dela.
  const anterior = saude
    ? await actionObterSaudeLoja({ inicio: diasAtras(59), fim: diasAtras(30), leve: true }).catch(() => null)
    : null;

  const primeiraMarca = saude?.marcas[0]?.brandId ?? null;
  const inicioPublicacoes = diasAtras(29);
  const publicacoes = primeiraMarca
    ? await actionObterDesempenhoPublicacoes({ brandId: primeiraMarca, inicio: inicioPublicacoes, fim: HOJE }).catch(() => null)
    : null;

  return (
    <div>
      {/* O mosaico lê o card aberto de `?card=` — useSearchParams exige um
          limite de Suspense para não forçar a página inteira a ser dinâmica. */}
      <Suspense fallback={null}>
        <Mosaico
          marcasIniciais={marcas}
          canaisIniciais={canais}
          saudeInicial={saude}
          anteriorInicial={anterior}
          posVendaInicial={posVenda}
          acoesIniciais={{ insights, sugestoes }}
          publicacoesInicial={primeiraMarca ? { brandId: primeiraMarca, inicio: inicioPublicacoes, fim: HOJE, dados: publicacoes } : null}
        />
      </Suspense>
    </div>
  );
}
