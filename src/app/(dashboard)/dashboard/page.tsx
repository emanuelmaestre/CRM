"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { SkeletonCard } from "@/shared/design-system/primitives/Skeleton";
import { CoachMarks, type CoachMarkStep } from "@/shared/design-system/primitives/CoachMarks";
import { PageHeader } from "@/shared/design-system/primitives/PageHeader";
import { ChannelLogo } from "@/shared/design-system/primitives/ChannelLogo";
import { BrandLogo } from "@/shared/design-system/primitives/BrandLogo";
import { stagger } from "@/shared/design-system/motion-variants";
import dashboardConfig from "@/config/dashboard.json";
import pagesConfig from "@/config/pages.json";
import channelsConfig from "@/config/channels.json";
import { getBrandConfig, isBrandSlug } from "@/shared/config/brands";
import { SectionLabel } from "./card-primitives";
import { FaturamentoCard } from "./faturamento-card";
import { GiroBaixoCard, MaisVendidosCard, ParadosCard, ReposicaoCard } from "./listas-cards";
import { ReclamacoesCard } from "./reclamacoes-card";
import { actionObterDashboardData, actionObterReclamacoes } from "./actions";
import { actionContarPedidosPorMarca, actionContarPedidosPorCanal } from "../vendas/actions";
import type {
  DashboardData,
  Granularidade,
} from "@/modules/relatorios/application/dashboard.service";
import type { ReclamacoesResultado } from "@/modules/relatorios/application/reclamacoes.service";

const copy = dashboardConfig;
const pedidosCopy = pagesConfig.pedidos;

type CanalVenda = "mercadolivre" | "shopee" | "tiktokshop";
type Marca = Awaited<ReturnType<typeof actionContarPedidosPorMarca>>[number];
type Canal = Awaited<ReturnType<typeof actionContarPedidosPorCanal>>[number];

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

/* ── Barra de escopo — mesmo padrão compacto de Vendas/Pedidos: marca e
   canal lado a lado numa linha só, sem rótulo escrito (a separação visual
   entre os dois grupos já basta). */
function MarcaPill({ marca, ativo, onClick }: { marca: Marca; ativo: boolean; onClick: () => void }) {
  const reduzir = useReducedMotion();
  const { slug } = marca;
  const vazia = marca.total === 0;
  const bloqueada = vazia && !ativo;
  const temIdentidade = isBrandSlug(slug);

  return (
    <motion.button
      type="button"
      onClick={bloqueada ? undefined : onClick}
      disabled={bloqueada}
      whileHover={!bloqueada && !reduzir ? { y: -1 } : undefined}
      whileTap={!bloqueada && !reduzir ? { scale: 0.97 } : undefined}
      aria-pressed={ativo}
      aria-label={marca.nome}
      title={bloqueada ? pedidosCopy.brandSelector.emptyHint.replace("{marca}", marca.nome) : undefined}
      className={`inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3.5 transition-colors ${
        bloqueada
          ? "border border-border opacity-40 cursor-not-allowed"
          : ativo
            ? "border-2 bg-card/70"
            : "border border-border/80 bg-card/40 hover:bg-card/70"
      }`}
      style={ativo ? { borderColor: getBrandConfig(slug)?.color ?? "var(--primary)" } : undefined}
    >
      {temIdentidade
        ? <BrandLogo brand={slug} height={13} />
        : <span className="text-[13px] font-semibold text-foreground">{marca.nome}</span>}
      <span className="text-[11px] tabular-nums text-muted-foreground">{marca.total}</span>
    </motion.button>
  );
}

function CanalPill({ canal, ativo, onClick }: { canal: Canal; ativo: boolean; onClick: () => void }) {
  const reduzir = useReducedMotion();
  const label = (channelsConfig.items as Record<string, { label?: string }>)[canal.tipo]?.label ?? canal.tipo;

  return (
    <motion.button
      type="button"
      onClick={canal.conectado ? onClick : undefined}
      disabled={!canal.conectado}
      whileHover={canal.conectado && !reduzir ? { y: -1 } : undefined}
      whileTap={canal.conectado && !reduzir ? { scale: 0.97 } : undefined}
      aria-pressed={ativo}
      title={canal.conectado ? undefined : pedidosCopy.channelSelector.disconnectedHint.replace("{canal}", label)}
      className={`inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3.5 transition-colors ${
        !canal.conectado
          ? "border border-border opacity-50 cursor-not-allowed"
          : ativo
            ? "border-2 border-[#9B30D9] bg-[rgba(155,48,217,.07)]"
            : "border border-border/80 bg-card/40 hover:bg-card/70"
      }`}
    >
      <ChannelLogo canal={canal.tipo} size="xs" variant="logo" />
      <span className="text-[13px] font-semibold text-foreground">{label}</span>
      <span className="text-[11px] tabular-nums text-muted-foreground">{canal.total}</span>
    </motion.button>
  );
}

export default function DashboardPage() {
  const [dados, setDados] = useState<DashboardData | null>(null);
  const [granularidade, setGranularidade] = useState<Granularidade>("dia");
  const [brandId, setBrandId] = useState("");
  const [canal, setCanal] = useState<CanalVenda | "">("");
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [canais, setCanais] = useState<Canal[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [reclamacoes, setReclamacoes] = useState<ReclamacoesResultado | null>(null);
  const [carregandoReclamacoes, setCarregandoReclamacoes] = useState(true);

  useEffect(() => {
    actionContarPedidosPorMarca(canal || undefined).then(setMarcas).catch(() => setMarcas([]));
  }, [canal]);

  useEffect(() => {
    actionContarPedidosPorCanal(brandId || undefined).then(setCanais).catch(() => setCanais([]));
  }, [brandId]);

  useEffect(() => {
    let ativo = true;
    actionObterDashboardData({ granularidade, brandId: brandId || undefined, canal: canal || undefined })
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
  }, [granularidade, brandId, canal]);

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

  const marcaSlugSelecionada = useMemo(
    () => marcas.find((item) => item.brandId === brandId)?.slug,
    [marcas, brandId],
  );

  // O filtro de marca vale para o painel inteiro, inclusive para o que veio da API.
  const reclamacoesVisiveis = useMemo<ReclamacoesResultado | null>(() => {
    if (!reclamacoes || !marcaSlugSelecionada) return reclamacoes;
    const itens = reclamacoes.itens.filter((item) => item.marca === marcaSlugSelecionada);
    return { ...reclamacoes, itens, total: itens.length };
  }, [reclamacoes, marcaSlugSelecionada]);

  const trocarGranularidade = useCallback((valor: Granularidade) => {
    setCarregando(true);
    setGranularidade(valor);
  }, []);

  const pendencias = (dados?.reposicao.length ?? 0) + (reclamacoesVisiveis?.total ?? 0);

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-6">
      {!carregando && dados && <CoachMarks storageKey="crm-leo:coachmarks:dashboard:v2" steps={TOUR} />}

      <PageHeader title={copy.header.title} description={copy.header.description} />

      <div className="flex flex-wrap items-center justify-center gap-2 rounded-full border border-border/60 bg-card/40 px-3.5 py-2 w-fit mx-auto">
        {marcas.map((marca) => (
          <MarcaPill
            key={marca.brandId}
            marca={marca}
            ativo={brandId === marca.brandId}
            onClick={() => setBrandId((atual) => atual === marca.brandId ? "" : marca.brandId)}
          />
        ))}

        <span aria-hidden="true" className="h-5 w-px bg-border" />

        {canais.map((item) => (
          <CanalPill
            key={item.tipo}
            canal={item}
            ativo={canal === item.tipo}
            onClick={() => setCanal((atual) => atual === item.tipo ? "" : item.tipo)}
          />
        ))}
      </div>

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
