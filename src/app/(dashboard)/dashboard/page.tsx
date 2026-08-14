"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { SkeletonCard } from "@/shared/design-system/primitives/Skeleton";
import { CoachMarks, type CoachMarkStep } from "@/shared/design-system/primitives/CoachMarks";
import { stagger } from "@/shared/design-system/motion-variants";
import { SectionLabel } from "./card-primitives";
import { FaturamentoCard } from "./faturamento-card";
import { GiroBaixoCard, MaisVendidosCard, ParadosCard, ReposicaoCard } from "./listas-cards";
import { ReclamacoesCard } from "./reclamacoes-card";
import { ScopeRow, type CardFiltro, type ScopeMarca, type ScopeCanal } from "./scope-row";
import { actionObterDashboardData, actionObterReclamacoes } from "./actions";
import { actionContarPedidosPorMarca, actionContarPedidosPorCanal } from "../vendas/actions";
import type {
  DashboardData,
  Granularidade,
} from "@/modules/relatorios/application/dashboard.service";
import type { ReclamacoesResultado } from "@/modules/relatorios/application/reclamacoes.service";

const FILTRO_PADRAO: CardFiltro = { brandId: "", canal: "" };

const TOUR: CoachMarkStep[] = [
  {
    target: '[data-coachmark="dashboard-resultado"]',
    title: "Seu faturamento, na lente que quiser",
    description: "Alterne entre diário, semanal e mensal — o painel inteiro acompanha.",
  },
  {
    target: '[data-coachmark="dashboard-acao"]',
    title: "O que precisa de você agora",
    description: "Reposição enquanto ainda dá tempo, e reclamações abertas no Mercado Livre.",
  },
];

function chaveFiltro(granularidade: Granularidade, filtro: CardFiltro) {
  return `${granularidade}|${filtro.brandId}|${filtro.canal}`;
}

/* ── Busca por card, com cache compartilhado ─────────────────────
   Cada card filtra de forma independente, mas a maioria começa sem
   filtro — então em vez de um card = uma busca sempre, cards com a
   mesma combinação (granularidade, marca, canal) dividem a mesma
   promessa. Só quem de fato diverge do padrão paga uma busca extra. */
function useDadosDoCard(cache: React.MutableRefObject<Map<string, Promise<DashboardData>>>, granularidade: Granularidade, filtro: CardFiltro) {
  const chave = chaveFiltro(granularidade, filtro);
  // A chave do último resultado recebido acompanha o dado — enquanto ela não
  // bater com a chave atual, o card está carregando. Evita guardar
  // "carregando" como estado à parte, o que exigiria setState síncrono no
  // corpo do efeito a cada troca de filtro.
  const [resultado, setResultado] = useState<{ chave: string; dados: DashboardData | null }>({ chave: "", dados: null });

  useEffect(() => {
    let ativo = true;
    let promessa = cache.current.get(chave);
    if (!promessa) {
      promessa = actionObterDashboardData({
        granularidade,
        brandId: filtro.brandId || undefined,
        canal: filtro.canal || undefined,
      });
      cache.current.set(chave, promessa);
      promessa.catch(() => cache.current.delete(chave));
    }
    promessa
      .then((dados) => { if (ativo) setResultado({ chave, dados }); })
      .catch(() => {
        if (ativo) {
          setResultado({ chave, dados: null });
          toast.error("Não foi possível carregar este card.", { id: chave });
        }
      });
    return () => { ativo = false; };
  }, [cache, chave, granularidade, filtro.brandId, filtro.canal]);

  return { dados: resultado.chave === chave ? resultado.dados : null, carregando: resultado.chave !== chave };
}

function EsqueletoPainel() {
  return (
    <div className="flex flex-col gap-5">
      {[0, 1, 2, 3, 4, 5].map((card) => (
        <SkeletonCard key={card} />
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const [granularidade, setGranularidade] = useState<Granularidade>("dia");
  const [marcas, setMarcas] = useState<ScopeMarca[]>([]);
  const [canais, setCanais] = useState<ScopeCanal[]>([]);
  const cache = useRef(new Map<string, Promise<DashboardData>>());

  const [filtroFaturamento, setFiltroFaturamento] = useState<CardFiltro>(FILTRO_PADRAO);
  const [filtroReposicao, setFiltroReposicao] = useState<CardFiltro>(FILTRO_PADRAO);
  const [filtroReclamacoes, setFiltroReclamacoes] = useState<CardFiltro>(FILTRO_PADRAO);
  const [filtroMaisVendidos, setFiltroMaisVendidos] = useState<CardFiltro>(FILTRO_PADRAO);
  const [filtroGiroBaixo, setFiltroGiroBaixo] = useState<CardFiltro>(FILTRO_PADRAO);
  const [filtroParados, setFiltroParados] = useState<CardFiltro>(FILTRO_PADRAO);

  const faturamento = useDadosDoCard(cache, granularidade, filtroFaturamento);
  const reposicao = useDadosDoCard(cache, granularidade, filtroReposicao);
  const maisVendidos = useDadosDoCard(cache, granularidade, filtroMaisVendidos);
  const giroBaixo = useDadosDoCard(cache, granularidade, filtroGiroBaixo);
  const parados = useDadosDoCard(cache, granularidade, filtroParados);

  const [reclamacoes, setReclamacoes] = useState<ReclamacoesResultado | null>(null);
  const [carregandoReclamacoes, setCarregandoReclamacoes] = useState(true);

  useEffect(() => {
    actionContarPedidosPorMarca().then(setMarcas).catch(() => setMarcas([]));
    actionContarPedidosPorCanal().then(setCanais).catch(() => setCanais([]));
  }, []);

  // Independente do painel: depende da API do Mercado Livre, que é lenta.
  // Não tem recorte por canal (o ML não separa reclamação por canal de venda).
  useEffect(() => {
    let ativo = true;
    actionObterReclamacoes()
      .then((resultado) => { if (ativo) setReclamacoes(resultado); })
      .catch(() => {
        if (ativo) setReclamacoes({ itens: [], total: 0, marcasComFalha: [], semContaConectada: false });
      })
      .finally(() => { if (ativo) setCarregandoReclamacoes(false); });
    return () => { ativo = false; };
  }, []);

  const marcaSlugReclamacoes = useMemo(
    () => marcas.find((item) => item.brandId === filtroReclamacoes.brandId)?.slug,
    [marcas, filtroReclamacoes.brandId],
  );
  const reclamacoesVisiveis = useMemo<ReclamacoesResultado | null>(() => {
    if (!reclamacoes || !marcaSlugReclamacoes) return reclamacoes;
    const itens = reclamacoes.itens.filter((item) => item.marca === marcaSlugReclamacoes);
    return { ...reclamacoes, itens, total: itens.length };
  }, [reclamacoes, marcaSlugReclamacoes]);

  const trocarGranularidade = useCallback((valor: Granularidade) => {
    setGranularidade(valor);
  }, []);

  const pendencias = (reposicao.dados?.reposicao.length ?? 0) + (reclamacoesVisiveis?.total ?? 0);
  const carregandoInicial = !faturamento.dados && !reposicao.dados;

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-6">
      {!carregandoInicial && <CoachMarks storageKey="crm-leo:coachmarks:dashboard:v2" steps={TOUR} />}

      {carregandoInicial ? (
        <EsqueletoPainel />
      ) : (
        <>
          {/* Ato 1 — como estamos */}
          <section className="flex flex-col gap-3" data-coachmark="dashboard-resultado">
            <SectionLabel>Resultado</SectionLabel>
            {faturamento.dados && (
              <FaturamentoCard
                dados={faturamento.dados.faturamento}
                granularidade={granularidade}
                onGranularidade={trocarGranularidade}
                carregando={faturamento.carregando}
                scope={<ScopeRow marcas={marcas} canais={canais} filtro={filtroFaturamento} onChange={setFiltroFaturamento} />}
              />
            )}
          </section>

          {/* Ato 2 — o que pede decisão agora */}
          <section className="flex flex-col gap-3" data-coachmark="dashboard-acao">
            <SectionLabel count={pendencias}>Precisa de ação</SectionLabel>
            <div className="flex flex-col gap-5">
              {reposicao.dados && (
                <ReposicaoCard
                  itens={reposicao.dados.reposicao}
                  scope={<ScopeRow marcas={marcas} canais={canais} filtro={filtroReposicao} onChange={setFiltroReposicao} />}
                />
              )}
              <ReclamacoesCard
                dados={reclamacoesVisiveis}
                carregando={carregandoReclamacoes}
                scope={<ScopeRow marcas={marcas} canais={[]} filtro={filtroReclamacoes} onChange={setFiltroReclamacoes} />}
              />
            </div>
          </section>

          {/* Ato 3 — como o catálogo se comporta, do que mais gira ao que não gira */}
          <section className="flex flex-col gap-3">
            <SectionLabel>Comportamento do catálogo</SectionLabel>
            <div className="flex flex-col gap-5">
              {maisVendidos.dados && (
                <MaisVendidosCard
                  itens={maisVendidos.dados.maisVendidos}
                  scope={<ScopeRow marcas={marcas} canais={canais} filtro={filtroMaisVendidos} onChange={setFiltroMaisVendidos} />}
                />
              )}
              {giroBaixo.dados && (
                <GiroBaixoCard
                  itens={giroBaixo.dados.giroBaixo}
                  scope={<ScopeRow marcas={marcas} canais={canais} filtro={filtroGiroBaixo} onChange={setFiltroGiroBaixo} />}
                />
              )}
              {parados.dados && (
                <ParadosCard
                  itens={parados.dados.parados}
                  scope={<ScopeRow marcas={marcas} canais={canais} filtro={filtroParados} onChange={setFiltroParados} />}
                />
              )}
            </div>
          </section>
        </>
      )}
    </motion.div>
  );
}
