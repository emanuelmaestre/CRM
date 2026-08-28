import { Suspense } from "react";
import { Mosaico } from "./mosaico";
import { actionObterFiltrosPedidos } from "../vendas/actions";
import { actionObterPosVenda, actionObterSnapshotAnterior } from "./actions";
import pagesConfig from "@/config/pages.json";

export const metadata = { title: pagesConfig.metricas.metadataTitle };

/* A entrada espera apenas os filtros leves. Pós-venda e recomendações não são
   necessários para tornar o mosaico clicável e carregam no próprio ritmo
   depois da hidratação, junto dos demais conteúdos de cada painel. */
/* O dia de hoje no calendário de São Paulo, não no do processo: em produção o
   servidor roda em UTC, e perto da meia-noite "hoje" viraria o dia seguinte
   do de quem está olhando a tela no Brasil. */
function hojeEmSaoPaulo() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

async function ConteudoMetricas() {
  const [{ marcas, canais }, snapshotOntem] = await Promise.all([
    actionObterFiltrosPedidos().catch(() => ({ marcas: [], canais: [] })),
    actionObterSnapshotAnterior(1).catch(() => null),
  ]);

  /* Pós-venda vem DEPOIS dos filtros, não em paralelo: precisa ser buscado no
     mesmo escopo com que o mosaico nasce (hoje + canal padrão), senão o card
     abre mostrando uma janela que ninguém pediu. Antes era `actionObterPosVenda()`
     sem argumento, que cai na janela padrão de 30 dias — era essa a origem de
     "Cumprimento de pedidos" contar um período diferente do resto do card. */
  const hoje = hojeEmSaoPaulo();
  const canalPadrao = canais.some((canal) => canal.tipo === "mercadolivre") ? ["mercadolivre"] : [];
  const posVenda = await actionObterPosVenda({ inicio: hoje, fim: hoje, canais: canalPadrao }).catch(() => null);

  return (
    <Mosaico
      marcasIniciais={marcas}
      canaisIniciais={canais}
      posVendaInicial={posVenda}
      posVendaInicialChave={`${hoje}..${hoje}|${[...canalPadrao].sort().join(",")}`}
      snapshotInicial={snapshotOntem}
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
