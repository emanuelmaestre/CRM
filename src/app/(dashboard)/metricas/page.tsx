import { Suspense } from "react";
import { Mosaico } from "./mosaico";
import {
  actionListarInsights, actionListarSugestoes,
  actionObterPosVenda,
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

/* Só leituras locais entram no HTML inicial. Saúde da loja inclui reputação e
   reclamações do Mercado Livre; Publicações faz até duas chamadas externas
   por anúncio. Colocar essas duas buscas aqui prendia a resposta inteira por
   alguns segundos. O Mosaico já tem os efeitos e skeletons necessários para
   carregá-las depois que a tela está interativa. */
async function ConteudoMetricas() {
  const [marcas, canais, posVenda, insights, sugestoes] = await Promise.all([
    actionContarPedidosPorMarca().catch(() => []),
    actionContarPedidosPorCanal().catch(() => []),
    actionObterPosVenda({ inicio: HOJE, fim: HOJE }).catch(() => null),
    actionListarInsights().catch(() => []),
    actionListarSugestoes().catch(() => []),
  ]);

  return (
    <Mosaico
      marcasIniciais={marcas}
      canaisIniciais={canais}
      posVendaInicial={posVenda}
      acoesIniciais={{ insights, sugestoes }}
    />
  );
}

function CarregandoMetricas() {
  return (
    <div className="flex flex-col gap-5" role="status" aria-label="Carregando métricas">
      {Array.from({ length: 4 }, (_, secao) => (
        <div key={secao} className="flex flex-col gap-2">
          <div className="shimmer h-3 w-24 rounded bg-muted" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: secao === 0 ? 3 : 2 }, (_, card) => (
              <div key={card} className="card-surface h-12 p-3">
                <div className="shimmer h-full w-full rounded bg-muted" />
              </div>
            ))}
          </div>
        </div>
      ))}
      <span className="sr-only">Carregando os indicadores do painel.</span>
    </div>
  );
}

export default function MetricasPage() {
  return (
    <div>
      {/* O await fica dentro do filho assíncrono: assim esta fronteira pode
          entregar feedback imediatamente, em vez de existir só depois que
          todas as consultas já terminaram. Também cobre o useSearchParams do
          Mosaico durante a pré-renderização. */}
      <Suspense fallback={<CarregandoMetricas />}>
        <ConteudoMetricas />
      </Suspense>
    </div>
  );
}
