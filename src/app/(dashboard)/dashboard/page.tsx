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
import type { DashboardData } from "@/modules/metricas/application/dashboard.service";
import type { ReclamacoesResultado } from "@/modules/metricas/application/reclamacoes.service";

const FILTRO_PADRAO: CardFiltro = { brandId: [], canal: [] };

export interface Periodo {
  /** yyyy-mm-dd */
  inicio: string;
  fim: string;
}

// Começa vazio de propósito: com value="" o calendário nativo abre já no mês
// atual, com hoje em destaque — não precisa de data pré-marcada pra "puxar"
// o dia de hoje. Preenchido cedo demais, o campo fica sujo antes do usuário
// escolher algo.
function periodoPadrao(): Periodo {
  return { inicio: "", fim: "" };
}

// toISOString() converte pro fuso UTC — perto da meia-noite local isso troca
// o dia (ex.: 14/08 22h em São Paulo já é 15/08 na UTC). Montar a string a
// partir de getFullYear/Month/Date evita a troca: fica sempre o dia local.
function paraDataInput(data: Date) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

/** Período que a busca de fato usa quando o usuário ainda não escolheu
 *  nenhuma data — os últimos 30 dias, por trás dos panos. Os campos De:/Até:
 *  continuam em branco na tela (é assim que o usuário pediu); só a consulta
 *  já tem uma janela sensata pra não deixar todo o painel esperando o
 *  usuário preencher duas datas antes de mostrar qualquer coisa. */
function periodoEfetivo(periodo: Periodo): Periodo {
  if (periodo.inicio && periodo.fim) return periodo;
  const fim = new Date();
  const inicio = new Date(fim);
  inicio.setDate(inicio.getDate() - 29);
  return { inicio: periodo.inicio || paraDataInput(inicio), fim: periodo.fim || paraDataInput(fim) };
}

const TOUR: CoachMarkStep[] = [
  {
    target: '[data-coachmark="dashboard-resultado"]',
    title: "Seu faturamento, no período que quiser",
    description: "Escolha as datas — o painel inteiro acompanha.",
  },
  {
    target: '[data-coachmark="dashboard-acao"]',
    title: "O que precisa de você agora",
    description: "Reposição enquanto ainda dá tempo, e reclamações abertas no Mercado Livre.",
  },
];

function chaveFiltro(periodo: Periodo, filtro: CardFiltro) {
  return `${periodo.inicio}..${periodo.fim}|${[...filtro.brandId].sort().join(",")}|${[...filtro.canal].sort().join(",")}`;
}

function semFiltroDefinido(filtro: CardFiltro) {
  return filtro.brandId.length === 0 && filtro.canal.length === 0;
}

/* ── Busca por card, com cache compartilhado ─────────────────────
   Sem marca ou canal marcado, o card não busca nada — fica esperando
   uma escolha em vez de assumir "todas as marcas". Cards com a mesma
   combinação (período, marca, canal) dividem a mesma promessa. Ao
   trocar de filtro, o resultado anterior continua na tela até o
   novo chegar — troca de conteúdo, não desmonte-remonte do card, que
   é o que causava o card "piscar" a cada clique. Data em branco não
   trava a busca — periodoEfetivo já resolve pros últimos 30 dias. */
function useDadosDoCard(cache: React.MutableRefObject<Map<string, Promise<DashboardData>>>, periodo: Periodo, filtro: CardFiltro) {
  const periodoBusca = periodoEfetivo(periodo);
  const chave = chaveFiltro(periodoBusca, filtro);
  const semFiltro = semFiltroDefinido(filtro);
  const [resultado, setResultado] = useState<{ chave: string; dados: DashboardData | null }>({ chave: "", dados: null });

  useEffect(() => {
    if (semFiltro) return;
    let ativo = true;
    let promessa = cache.current.get(chave);
    if (!promessa) {
      promessa = actionObterDashboardData({
        granularidade: "dia",
        brandId: filtro.brandId.length > 0 ? filtro.brandId : undefined,
        canal: filtro.canal.length > 0 ? filtro.canal : undefined,
        inicio: periodoBusca.inicio,
        fim: periodoBusca.fim,
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
  }, [cache, chave, periodoBusca.inicio, periodoBusca.fim, filtro.brandId, filtro.canal, semFiltro]);

  if (semFiltro) return { dados: null, carregando: false, semFiltro: true };
  return { dados: resultado.dados, carregando: resultado.chave !== chave, semFiltro: false };
}

export default function DashboardPage() {
  const [periodo, setPeriodo] = useState<Periodo>(periodoPadrao);
  const [marcas, setMarcas] = useState<ScopeMarca[]>([]);
  const [canais, setCanais] = useState<ScopeCanal[]>([]);
  const cache = useRef(new Map<string, Promise<DashboardData>>());

  const [filtroFaturamento, setFiltroFaturamento] = useState<CardFiltro>(FILTRO_PADRAO);
  const [filtroReposicao, setFiltroReposicao] = useState<CardFiltro>(FILTRO_PADRAO);
  const [filtroReclamacoes, setFiltroReclamacoes] = useState<CardFiltro>(FILTRO_PADRAO);
  const [filtroMaisVendidos, setFiltroMaisVendidos] = useState<CardFiltro>(FILTRO_PADRAO);
  const [filtroGiroBaixo, setFiltroGiroBaixo] = useState<CardFiltro>(FILTRO_PADRAO);
  const [filtroParados, setFiltroParados] = useState<CardFiltro>(FILTRO_PADRAO);

  const faturamento = useDadosDoCard(cache, periodo, filtroFaturamento);
  const reposicao = useDadosDoCard(cache, periodo, filtroReposicao);
  const maisVendidos = useDadosDoCard(cache, periodo, filtroMaisVendidos);
  const giroBaixo = useDadosDoCard(cache, periodo, filtroGiroBaixo);
  const parados = useDadosDoCard(cache, periodo, filtroParados);

  const [reclamacoes, setReclamacoes] = useState<ReclamacoesResultado | null>(null);
  const [carregandoReclamacoes, setCarregandoReclamacoes] = useState(true);
  const semFiltroReclamacoes = filtroReclamacoes.brandId.length === 0;

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

  const marcasSlugReclamacoes = useMemo(
    () => marcas.filter((item) => filtroReclamacoes.brandId.includes(item.brandId)).map((item) => item.slug),
    [marcas, filtroReclamacoes.brandId],
  );
  const reclamacoesVisiveis = useMemo<ReclamacoesResultado | null>(() => {
    if (!reclamacoes || marcasSlugReclamacoes.length === 0) return null;
    const itens = reclamacoes.itens.filter((item) => marcasSlugReclamacoes.includes(item.marca));
    return { ...reclamacoes, itens, total: itens.length };
  }, [reclamacoes, marcasSlugReclamacoes]);

  const trocarDatasPersonalizadas = useCallback((inicio: string, fim: string) => {
    setPeriodo({ inicio, fim });
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
          periodo={periodo}
          onDatasPersonalizadas={trocarDatasPersonalizadas}
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
            // Sem pílulas de canal aqui de propósito: o Mercado Livre não separa
            // reclamação por canal de venda, então filtrar por canal não faria
            // nada — pílulas clicáveis que não mudam o resultado só confundem.
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
