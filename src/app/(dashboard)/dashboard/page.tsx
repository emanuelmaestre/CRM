"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { SkeletonCard } from "@/shared/design-system/primitives/Skeleton";
import { CoachMarks, type CoachMarkStep } from "@/shared/design-system/primitives/CoachMarks";
import { PageHeader } from "@/shared/design-system/primitives/PageHeader";
import { stagger } from "@/shared/design-system/motion-variants";
import dashboardConfig from "@/config/dashboard.json";
import { SectionLabel } from "./card-primitives";
import { FaturamentoCard } from "./faturamento-card";
import { GiroBaixoCard, MaisVendidosCard, ParadosCard, ReposicaoCard } from "./listas-cards";
import { ReclamacoesCard } from "./reclamacoes-card";
import { actionObterDashboardData, actionObterReclamacoes } from "./actions";
import type {
  DashboardData,
  Granularidade,
} from "@/modules/relatorios/application/dashboard.service";
import type { ReclamacoesResultado } from "@/modules/relatorios/application/reclamacoes.service";

const copy = dashboardConfig;

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
  const [dados, setDados] = useState<DashboardData | null>(null);
  const [granularidade, setGranularidade] = useState<Granularidade>("dia");
  const [marca, setMarca] = useState("todas");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [reclamacoes, setReclamacoes] = useState<ReclamacoesResultado | null>(null);
  const [carregandoReclamacoes, setCarregandoReclamacoes] = useState(true);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    actionObterDashboardData({ granularidade, brand: marca })
      .then((resultado) => {
        if (!ativo) return;
        setDados(resultado);
        setErro(null);
      })
      .catch((error: unknown) => {
        if (!ativo) return;
        setErro(error instanceof Error ? error.message : "Não foi possível carregar o painel.");
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => { ativo = false; };
  }, [granularidade, marca]);

  // Independente do painel: depende da API do Mercado Livre, que é lenta.
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

  // O filtro de marca vale para o painel inteiro, inclusive para o que veio da API.
  const reclamacoesVisiveis = useMemo<ReclamacoesResultado | null>(() => {
    if (!reclamacoes || marca === "todas") return reclamacoes;
    const itens = reclamacoes.itens.filter((item) => item.marca === marca);
    return { ...reclamacoes, itens, total: itens.length };
  }, [reclamacoes, marca]);

  const trocarGranularidade = useCallback((valor: Granularidade) => {
    setGranularidade(valor);
  }, []);

  const marcas = dados?.filtros.brands ?? [{ value: "todas", label: copy.filters.allBrands }];
  const pendencias = (dados?.reposicao.length ?? 0) + (reclamacoesVisiveis?.total ?? 0);

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-6">
      {!carregando && dados && <CoachMarks storageKey="crm-leo:coachmarks:dashboard:v2" steps={TOUR} />}

      <PageHeader
        title={copy.header.title}
        description={copy.header.description}
        actions={
          <label className="flex items-center gap-2">
            <span className="sr-only">{copy.filters.brandLabel}</span>
            <select
              value={marca}
              disabled={carregando && !dados}
              onChange={(event) => setMarca(event.target.value)}
              className="h-10 appearance-none rounded-xl border border-border bg-card px-4 text-sm font-medium text-foreground shadow-[var(--shadow-card)] outline-none transition-colors hover:border-muted-foreground/40 focus:border-foreground disabled:opacity-60"
            >
              {marcas.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
        }
      />

      {erro && (
        <div className="rounded-xl border border-[#C21820]/20 bg-[#C21820]/10 px-4 py-3 text-sm text-[#C21820]">
          {erro}
        </div>
      )}

      {!dados ? (
        <EsqueletoPainel />
      ) : (
        <>
          {/* Ato 1 — como estamos */}
          <section className="flex flex-col gap-3" data-coachmark="dashboard-resultado">
            <SectionLabel>Resultado</SectionLabel>
            <FaturamentoCard
              dados={dados.faturamento}
              granularidade={granularidade}
              onGranularidade={trocarGranularidade}
              carregando={carregando}
            />
          </section>

          {/* Ato 2 — o que pede decisão agora */}
          <section className="flex flex-col gap-3" data-coachmark="dashboard-acao">
            <SectionLabel count={pendencias}>Precisa de ação</SectionLabel>
            <div className="flex flex-col gap-5">
              <ReposicaoCard itens={dados.reposicao} />
              <ReclamacoesCard dados={reclamacoesVisiveis} carregando={carregandoReclamacoes} />
            </div>
          </section>

          {/* Ato 3 — como o catálogo se comporta, do que mais gira ao que não gira */}
          <section className="flex flex-col gap-3">
            <SectionLabel>Comportamento do catálogo</SectionLabel>
            <div className="flex flex-col gap-5">
              <MaisVendidosCard itens={dados.maisVendidos} />
              <GiroBaixoCard itens={dados.giroBaixo} />
              <ParadosCard itens={dados.parados} />
            </div>
          </section>
        </>
      )}
    </motion.div>
  );
}
