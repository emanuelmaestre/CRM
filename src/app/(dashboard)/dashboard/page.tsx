"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
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

function semFiltroDefinido(filtro: CardFiltro) {
  return !filtro.brandId && !filtro.canal;
}

/* ── Busca por card, com cache compartilhado ─────────────────────
   Sem marca ou canal marcado, o card não busca nada — fica esperando
   uma escolha em vez de assumir "todas as marcas". Cards com a mesma
   combinação (granularidade, marca, canal) dividem a mesma promessa.
   Ao trocar de filtro, o resultado anterior continua na tela até o
   novo chegar — troca de conteúdo, não desmonte-remonte do card, que
   é o que causava o card "piscar" a cada clique. */
function useDadosDoCard(cache: React.MutableRefObject<Map<string, Promise<DashboardData>>>, granularidade: Granularidade, filtro: CardFiltro) {
  const chave = chaveFiltro(granularidade, filtro);
  const semFiltro = semFiltroDefinido(filtro);
  const [resultado, setResultado] = useState<{ chave: string; dados: DashboardData | null }>({ chave: "", dados: null });

  useEffect(() => {
    if (semFiltro) return;
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
  }, [cache, chave, granularidade, filtro.brandId, filtro.canal, semFiltro]);

  if (semFiltro) return { dados: null, carregando: false, semFiltro: true };
  return { dados: resultado.dados, carregando: resultado.chave !== chave, semFiltro: false };
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
  const semFiltroReclamacoes = !filtroReclamacoes.brandId;

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
    if (!reclamacoes || !marcaSlugReclamacoes) return null;
    const itens = reclamacoes.itens.filter((item) => item.marca === marcaSlugReclamacoes);
    return { ...reclamacoes, itens, total: itens.length };
  }, [reclamacoes, marcaSlugReclamacoes]);

  const trocarGranularidade = useCallback((valor: Granularidade) => {
    setGranularidade(valor);
  }, []);

  const pendencias = (reposicao.dados?.reposicao.length ?? 0) + (reclamacoesVisiveis?.total ?? 0);

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-6">
      {marcas.length > 0 && <CoachMarks storageKey="crm-leo:coachmarks:dashboard:v2" steps={TOUR} />}

      {/* Ato 1 — como estamos */}
      <section className="flex flex-col gap-3" data-coachmark="dashboard-resultado">
        <SectionLabel>Resultado</SectionLabel>
        <FaturamentoCard
          dados={faturamento.dados?.faturamento ?? null}
          granularidade={granularidade}
          onGranularidade={trocarGranularidade}
          carregando={faturamento.carregando}
          semFiltro={faturamento.semFiltro}
          scope={<ScopeRow marcas={marcas} canais={canais} filtro={filtroFaturamento} onChange={setFiltroFaturamento} />}
        />
      </section>

      {/* Ato 2 — o que pede decisão agora */}
      <section className="flex flex-col gap-3" data-coachmark="dashboard-acao">
        <SectionLabel count={pendencias}>Precisa de ação</SectionLabel>
        <div className="flex flex-col gap-5">
          <ReposicaoCard
            itens={reposicao.dados?.reposicao ?? null}
            carregando={reposicao.carregando}
            semFiltro={reposicao.semFiltro}
            scope={<ScopeRow marcas={marcas} canais={canais} filtro={filtroReposicao} onChange={setFiltroReposicao} />}
          />
          <ReclamacoesCard
            dados={reclamacoesVisiveis}
            carregando={carregandoReclamacoes}
            semFiltro={semFiltroReclamacoes}
            scope={<ScopeRow marcas={marcas} canais={[]} filtro={filtroReclamacoes} onChange={setFiltroReclamacoes} />}
          />
        </div>
      </section>

      {/* Ato 3 — como o catálogo se comporta, do que mais gira ao que não gira */}
      <section className="flex flex-col gap-3">
        <SectionLabel>Comportamento do catálogo</SectionLabel>
        <div className="flex flex-col gap-5">
          <MaisVendidosCard
            itens={maisVendidos.dados?.maisVendidos ?? null}
            carregando={maisVendidos.carregando}
            semFiltro={maisVendidos.semFiltro}
            scope={<ScopeRow marcas={marcas} canais={canais} filtro={filtroMaisVendidos} onChange={setFiltroMaisVendidos} />}
          />
          <GiroBaixoCard
            itens={giroBaixo.dados?.giroBaixo ?? null}
            carregando={giroBaixo.carregando}
            semFiltro={giroBaixo.semFiltro}
            scope={<ScopeRow marcas={marcas} canais={canais} filtro={filtroGiroBaixo} onChange={setFiltroGiroBaixo} />}
          />
          <ParadosCard
            itens={parados.dados?.parados ?? null}
            carregando={parados.carregando}
            semFiltro={parados.semFiltro}
            scope={<ScopeRow marcas={marcas} canais={canais} filtro={filtroParados} onChange={setFiltroParados} />}
          />
        </div>
      </section>
    </motion.div>
  );
}
