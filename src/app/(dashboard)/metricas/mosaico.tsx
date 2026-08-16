"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import {
  AlertTriangle, BarChart3, FileText, Gauge, Hourglass, MessageSquare, Megaphone,
  Package, ShoppingBag, Sparkles, Store, Timer, TrendingDown, TrendingUp,
} from "lucide-react";
import { CalendarioPopover } from "@/shared/design-system/primitives/CalendarioPopover";
import { CoachMarks, type CoachMarkStep } from "@/shared/design-system/primitives/CoachMarks";
import { stagger } from "@/shared/design-system/motion-variants";
import { getBrandConfig, isBrandSlug } from "@/shared/config/brands";
import { channelAccent } from "@/shared/design-system/primitives/ChannelLogo";
import metricasConfig from "@/config/metricas.json";

import { Bloco, Foco, ordenarPorUrgencia, type BlocoDef } from "./bloco";
import { ScopeRow, type CardFiltro, type ScopeCanal, type ScopeMarca } from "./painel/scope-row";
import { type Periodo } from "./painel/card-primitives";
import { FaturamentoCard } from "./painel/faturamento-card";
import { GiroBaixoCard, MaisVendidosCard, ParadosCard, ReposicaoCard } from "./painel/listas-cards";
import { ReclamacoesCard } from "./painel/reclamacoes-card";
import { actionObterDashboardData, actionObterReclamacoes } from "./painel/actions";
import { actionContarPedidosPorCanal, actionContarPedidosPorMarca } from "../vendas/actions";
import { actionObterAtendimento, actionObterPosVenda, actionObterSaudeLoja } from "./actions";
import { AcoesCard } from "./acoes-card";
import { AtendimentoCard } from "./atendimento-card";
import { ComparacaoCard } from "./comparacao-card";
import { ComparacaoPeriodoCard } from "./comparacao-periodo-card";
import { PosVendaCard } from "./pos-venda-card";
import { PublicacoesCard } from "./publicacoes-card";
import { ReputacaoCard } from "./reputacao-card";
import { ScoreCard } from "./score-card";
import { exportarMetricasPDF } from "./exportar-pdf";
import type { DashboardData } from "@/modules/metricas/application/dashboard.service";
import type { ReclamacoesResultado } from "@/modules/metricas/application/reclamacoes.service";
import type { SaudeLojaResultado } from "@/modules/metricas/application/saude-loja.service";
import type { AtendimentoResumo } from "@/modules/metricas/application/atendimento.service";

const copy = metricasConfig.mosaico;
const blocosCopy = copy.blocos;

const FILTRO_PADRAO: CardFiltro = { brandId: [], canal: [] };

/* ── Datas ─────────────────────────────────────────────────────── */

// toISOString() converte pro fuso UTC — perto da meia-noite local isso troca o
// dia. Montar a string a partir de getFullYear/Month/Date mantém o dia local.
function paraDataInput(data: Date) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}

const hoje = paraDataInput(new Date());

function diasAtras(total: number) {
  const data = new Date();
  data.setDate(data.getDate() - total);
  return paraDataInput(data);
}

/** Os campos De:/Até: começam em branco de propósito, mas a busca não espera o
 *  usuário preencher dois campos para mostrar qualquer coisa: sem escolha, a
 *  janela é os últimos 30 dias. */
function periodoEfetivo(periodo: Periodo): Periodo {
  if (periodo.inicio && periodo.fim) return periodo;
  return { inicio: periodo.inicio || diasAtras(29), fim: periodo.fim || hoje };
}

/* ── Busca por card, com cache compartilhado ──────────────────────
   Sem marca ou canal marcado, o card não busca nada — fica esperando uma
   escolha em vez de assumir "todas as marcas". Cards com a mesma combinação
   (período, marca, canal) dividem a mesma promessa, então marcar a mesma marca
   em seis blocos custa uma consulta, não seis. */
function chaveFiltro(periodo: Periodo, filtro: CardFiltro) {
  return `${periodo.inicio}..${periodo.fim}|${[...filtro.brandId].sort().join(",")}|${[...filtro.canal].sort().join(",")}`;
}

function semFiltroDefinido(filtro: CardFiltro) {
  return filtro.brandId.length === 0 && filtro.canal.length === 0;
}

function useDadosDoCard(
  cache: React.MutableRefObject<Map<string, Promise<DashboardData>>>,
  periodo: Periodo,
  filtro: CardFiltro,
) {
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

/* ── Miniatura de série ───────────────────────────────────────────
   Doze barras no rodapé do bloco de Faturamento. Não tem eixo nem rótulo de
   propósito: aqui ela responde "subindo ou caindo?", e a leitura exata mora no
   card em foco. */
function MiniSerie({ serie, cor }: { serie: { altura: number }[]; cor: string }) {
  const pontos = serie.slice(-12);
  if (pontos.length === 0) return null;
  return (
    <span className="flex h-10 w-full items-end gap-[2px] px-4">
      {pontos.map((ponto, indice) => (
        <motion.span
          key={indice}
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ duration: 0.4, delay: indice * 0.02 }}
          className="flex-1 rounded-t-[2px]"
          style={{ height: `${Math.max(ponto.altura, 4)}%`, background: cor, opacity: 0.28, transformOrigin: "bottom" }}
        />
      ))}
    </span>
  );
}

const TOUR: CoachMarkStep[] = [
  {
    target: '[data-coachmark="mosaico-periodo"]',
    title: "Um período para tudo",
    description: "As datas aqui em cima valem para o mosaico inteiro.",
  },
  {
    target: '[data-coachmark="mosaico-grade"]',
    title: "Clique em qualquer bloco",
    description: "Ele cresce e vira o card completo. Esc volta, ← → pulam de card.",
  },
];

/* ── Mosaico ───────────────────────────────────────────────────── */

export function Mosaico() {
  const router = useRouter();
  const params = useSearchParams();
  const cardAberto = params.get("card");

  const [periodo, setPeriodo] = useState<Periodo>({ inicio: "", fim: "" });
  const [marcas, setMarcas] = useState<ScopeMarca[]>([]);
  const [canais, setCanais] = useState<ScopeCanal[]>([]);
  const cache = useRef(new Map<string, Promise<DashboardData>>());

  /* Um filtro por card, como antes da fusão: comparar duas marcas lado a lado
     no mosaico exige que os blocos possam discordar entre si. */
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

  /* Escolher marca em seis blocos é o mesmo clique seis vezes. Ao marcar a
     primeira, oferecemos repetir nos que ainda estão vazios — continua sendo
     filtro por card, só deixou de cobrar o pedágio. */
  const [sugestao, setSugestao] = useState<CardFiltro | null>(null);
  const filtrosVazios =
    [filtroFaturamento, filtroReposicao, filtroReclamacoes, filtroMaisVendidos, filtroGiroBaixo, filtroParados]
      .filter(semFiltroDefinido).length;

  const aplicarEmTodos = useCallback((filtro: CardFiltro) => {
    for (const [atual, definir] of [
      [filtroFaturamento, setFiltroFaturamento],
      [filtroReposicao, setFiltroReposicao],
      [filtroReclamacoes, setFiltroReclamacoes],
      [filtroMaisVendidos, setFiltroMaisVendidos],
      [filtroGiroBaixo, setFiltroGiroBaixo],
      [filtroParados, setFiltroParados],
    ] as const) {
      // Só preenche o que está vazio: quem já escolheu algo escolheu por um
      // motivo, e sobrescrever isso seria o oposto de "filtro por card".
      if (semFiltroDefinido(atual)) definir(filtro);
    }
    setSugestao(null);
  }, [filtroFaturamento, filtroReposicao, filtroReclamacoes, filtroMaisVendidos, filtroGiroBaixo, filtroParados]);

  /** Envolve o setState de um filtro para oferecer o atalho na primeira escolha. */
  const comSugestao = useCallback(
    (definir: (filtro: CardFiltro) => void) => (filtro: CardFiltro) => {
      definir(filtro);
      if (!semFiltroDefinido(filtro)) setSugestao(filtro);
    },
    [],
  );

  useEffect(() => {
    if (!sugestao) return;
    const relogio = setTimeout(() => setSugestao(null), 7000);
    return () => clearTimeout(relogio);
  }, [sugestao]);

  const [reclamacoes, setReclamacoes] = useState<ReclamacoesResultado | null>(null);
  const [carregandoReclamacoes, setCarregandoReclamacoes] = useState(true);
  const semFiltroReclamacoes = filtroReclamacoes.brandId.length === 0;

  useEffect(() => {
    actionContarPedidosPorMarca().then(setMarcas).catch(() => setMarcas([]));
    actionContarPedidosPorCanal().then(setCanais).catch(() => setCanais([]));
  }, []);

  // Independente do resto: depende da API do Mercado Livre, que é lenta. Não
  // tem recorte por canal (o ML não separa reclamação por canal de venda).
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

  /* ── Saúde da loja, atendimento e janela anterior ── */

  const completo = Boolean(periodo.inicio && periodo.fim);
  const inicio = completo ? periodo.inicio : undefined;
  const fim = completo ? periodo.fim : undefined;
  const chave = `${inicio ?? ""}..${fim ?? ""}`;

  const [saude, setSaude] = useState<{ chave: string; dados: SaudeLojaResultado | null }>({ chave: "", dados: null });
  const [atendimento, setAtendimento] = useState<{ chave: string; dados: AtendimentoResumo | null }>({ chave: "", dados: null });
  const [anterior, setAnterior] = useState<{ chave: string; dados: SaudeLojaResultado | null }>({ chave: "", dados: null });

  useEffect(() => {
    let ativo = true;
    actionObterSaudeLoja({ inicio, fim })
      .then((resultado) => { if (ativo) setSaude({ chave, dados: resultado }); })
      .catch(() => {
        if (!ativo) return;
        setSaude({ chave, dados: null });
        toast.error(metricasConfig.erros.carregar, { id: "metricas-saude" });
      });
    return () => { ativo = false; };
  }, [chave, inicio, fim]);

  useEffect(() => {
    let ativo = true;
    const fimAtual = fim ? new Date(`${fim}T12:00:00`) : new Date();
    const inicioAtual = inicio ? new Date(`${inicio}T12:00:00`) : new Date(fimAtual);
    if (!inicio) inicioAtual.setDate(inicioAtual.getDate() - 29);
    const duracao = Math.round((fimAtual.getTime() - inicioAtual.getTime()) / 86_400_000) + 1;
    const fimAnterior = new Date(inicioAtual); fimAnterior.setDate(fimAnterior.getDate() - 1);
    const inicioAnterior = new Date(fimAnterior); inicioAnterior.setDate(inicioAnterior.getDate() - duracao + 1);
    actionObterSaudeLoja({ inicio: paraDataInput(inicioAnterior), fim: paraDataInput(fimAnterior) })
      .then((dados) => { if (ativo) setAnterior({ chave, dados }); })
      .catch(() => { if (ativo) setAnterior({ chave, dados: null }); });
    return () => { ativo = false; };
  }, [chave, inicio, fim]);

  useEffect(() => {
    let ativo = true;
    actionObterAtendimento({ inicio, fim })
      .then((resultado) => { if (ativo) setAtendimento({ chave, dados: resultado }); })
      .catch(() => { if (ativo) setAtendimento({ chave, dados: null }); });
    return () => { ativo = false; };
  }, [chave, inicio, fim]);

  const carregandoSaude = saude.chave !== chave;
  const carregandoAtendimento = atendimento.chave !== chave;

  /* ── Exportar ── */

  const [exportando, setExportando] = useState(false);

  async function exportar() {
    if (!saude.dados) return;
    setExportando(true);
    try {
      const posVenda = await actionObterPosVenda({ inicio, fim });
      await exportarMetricasPDF(saude.dados, atendimento.dados, posVenda);
      toast.success(metricasConfig.exportacao.sucesso);
    } catch {
      toast.error(metricasConfig.exportacao.erro);
    } finally {
      setExportando(false);
    }
  }

  /* ── Cores do pico do gráfico de Faturamento ──
     Segue o que está filtrado no card: marca escolhida manda; sem marca mas
     com canal, usa a cor do canal; sem nada, o gradiente genérico. */
  const coresFaturamento = useMemo(() => {
    const porMarca = marcas
      .filter((item) => filtroFaturamento.brandId.includes(item.brandId))
      .map((item) => (isBrandSlug(item.slug) ? getBrandConfig(item.slug)?.color : undefined))
      .filter((cor): cor is string => Boolean(cor));
    return porMarca.length > 0 ? porMarca : filtroFaturamento.canal.map((tipo) => channelAccent(tipo));
  }, [marcas, filtroFaturamento.brandId, filtroFaturamento.canal]);

  const reclamacoesVisiveis = useMemo<ReclamacoesResultado | null>(() => {
    const slugs = marcas.filter((item) => filtroReclamacoes.brandId.includes(item.brandId)).map((item) => item.slug);
    if (!reclamacoes || slugs.length === 0) return null;
    const itens = reclamacoes.itens.filter((item) => slugs.includes(item.marca));
    return { ...reclamacoes, itens, total: itens.length };
  }, [reclamacoes, marcas, filtroReclamacoes.brandId]);

  const trocarDatas = useCallback((novoInicio: string, novoFim: string) => {
    setPeriodo({ inicio: novoInicio, fim: novoFim });
  }, []);

  /* ── Blocos ───────────────────────────────────────────────────── */

  const escopo = (filtro: CardFiltro, definir: (valor: CardFiltro) => void, comCanais = true) => (
    <ScopeRow marcas={marcas} canais={comCanais ? canais : []} filtro={filtro} onChange={comSugestao(definir)} />
  );

  const dadosFaturamento = faturamento.dados?.faturamento ?? null;
  const marcasPublicacoes = saude.dados?.marcas ?? [];

  const blocos = useMemo<BlocoDef[]>(() => {
    const lista: BlocoDef[] = [
      {
        id: "faturamento",
        titulo: blocosCopy.faturamento.titulo,
        icone: TrendingUp,
        accent: "var(--acento-2)",
        largura: 2,
        carregando: faturamento.carregando,
        semFiltro: faturamento.semFiltro,
        miniatura: dadosFaturamento ? <MiniSerie serie={dadosFaturamento.serie} cor="var(--acento-2)" /> : null,
        resumo: {
          valor: dadosFaturamento?.total ?? null,
          variacao: dadosFaturamento?.variacaoPercentual ?? null,
          legenda: dadosFaturamento
            ? blocosCopy.faturamento.legenda
                .replace("{pedidos}", String(dadosFaturamento.pedidos))
                .replace("{ticket}", dadosFaturamento.ticketMedio)
            : blocosCopy.faturamento.legenda,
        },
        render: () => (
          <FaturamentoCard
            dados={dadosFaturamento}
            periodo={periodo}
            onDatasPersonalizadas={trocarDatas}
            carregando={faturamento.carregando}
            semFiltro={faturamento.semFiltro}
            cores={coresFaturamento}
            scope={escopo(filtroFaturamento, setFiltroFaturamento)}
          />
        ),
      },
      {
        id: "score",
        titulo: blocosCopy.score.titulo,
        icone: Gauge,
        accent: saude.dados?.faixaGeralCor ?? "var(--acento-1)",
        carregando: carregandoSaude,
        resumo: {
          valor: saude.dados?.scoreGeral !== null && saude.dados?.scoreGeral !== undefined
            ? String(Math.round(saude.dados.scoreGeral))
            : null,
          legenda: saude.dados?.faixaGeralLabel ?? blocosCopy.score.legenda,
          alerta: saude.dados?.scoreGeral !== null && saude.dados?.scoreGeral !== undefined && saude.dados.scoreGeral < 50
            ? { nivel: saude.dados.scoreGeral < 30 ? "critico" : "atencao", texto: saude.dados.faixaGeralLabel ?? "Atenção" }
            : null,
        },
        render: () => <ScoreCard dados={saude.dados} carregando={carregandoSaude} />,
      },
      {
        id: "reclamacoes",
        titulo: blocosCopy.reclamacoes.titulo,
        icone: AlertTriangle,
        accent: "var(--destructive)",
        carregando: carregandoReclamacoes,
        semFiltro: semFiltroReclamacoes,
        // Sem pílulas de canal: o Mercado Livre não separa reclamação por canal
        // de venda, então filtrar por canal aqui não mudaria nada.
        resumo: {
          valor: reclamacoesVisiveis ? String(reclamacoesVisiveis.total) : null,
          legenda: blocosCopy.reclamacoes.legenda,
          alerta: reclamacoesVisiveis && reclamacoesVisiveis.total > 0
            ? { nivel: "critico", texto: "abertas" }
            : null,
        },
        render: () => (
          <ReclamacoesCard
            dados={reclamacoesVisiveis}
            carregando={carregandoReclamacoes}
            semFiltro={semFiltroReclamacoes}
            scope={escopo(filtroReclamacoes, setFiltroReclamacoes, false)}
          />
        ),
      },
      {
        id: "reposicao",
        titulo: blocosCopy.reposicao.titulo,
        icone: Package,
        accent: "var(--warning)",
        carregando: reposicao.carregando,
        semFiltro: reposicao.semFiltro,
        resumo: {
          valor: reposicao.dados ? String(reposicao.dados.reposicao.length) : null,
          legenda: blocosCopy.reposicao.legenda,
          alerta: reposicao.dados && reposicao.dados.reposicao.length > 0
            ? { nivel: "atencao", texto: "repor" }
            : null,
        },
        render: () => (
          <ReposicaoCard
            itens={reposicao.dados?.reposicao ?? null}
            carregando={reposicao.carregando}
            semFiltro={reposicao.semFiltro}
            scope={escopo(filtroReposicao, setFiltroReposicao)}
          />
        ),
      },
      {
        id: "reputacao",
        titulo: blocosCopy.reputacao.titulo,
        icone: Store,
        accent: "var(--acento-3)",
        carregando: carregandoSaude,
        resumo: {
          valor: null,
          legenda: saude.dados?.reputacaoIndisponivel ? metricasConfig.reputacaoCard.semTermometro : blocosCopy.reputacao.legenda,
        },
        render: () => <ReputacaoCard dados={saude.dados} carregando={carregandoSaude} />,
      },
      {
        id: "comparacao",
        titulo: blocosCopy.comparacao.titulo,
        icone: BarChart3,
        accent: "var(--acento-1)",
        carregando: carregandoSaude,
        resumo: {
          valor: saude.dados ? String(saude.dados.marcas.length) : null,
          legenda: blocosCopy.comparacao.legenda,
        },
        render: () => <ComparacaoCard dados={saude.dados} carregando={carregandoSaude} />,
      },
      {
        id: "atendimento",
        titulo: blocosCopy.atendimento.titulo,
        icone: Timer,
        accent: "var(--acento-2)",
        carregando: carregandoAtendimento,
        resumo: {
          valor: atendimento.dados?.taxaResposta !== null && atendimento.dados?.taxaResposta !== undefined
            ? `${Math.round(atendimento.dados.taxaResposta)}%`
            : null,
          variacao: atendimento.dados?.variacaoTaxaResposta ?? null,
          legenda: atendimento.dados?.medianaLabel
            ? `${metricasConfig.atendimentoCard.medianaLabel}: ${atendimento.dados.medianaLabel}`
            : blocosCopy.atendimento.legenda,
        },
        render: () => <AtendimentoCard dados={atendimento.dados} carregando={carregandoAtendimento} />,
      },
      {
        id: "maisVendidos",
        titulo: blocosCopy.maisVendidos.titulo,
        icone: ShoppingBag,
        accent: "var(--acento-1)",
        carregando: maisVendidos.carregando,
        semFiltro: maisVendidos.semFiltro,
        resumo: {
          valor: maisVendidos.dados?.maisVendidos[0]?.quantidade !== undefined
            ? String(maisVendidos.dados.maisVendidos[0].quantidade)
            : null,
          legenda: maisVendidos.dados?.maisVendidos[0]?.nome ?? blocosCopy.maisVendidos.legenda,
          rodape: blocosCopy.maisVendidos.legenda,
        },
        render: () => (
          <MaisVendidosCard
            itens={maisVendidos.dados?.maisVendidos ?? null}
            carregando={maisVendidos.carregando}
            semFiltro={maisVendidos.semFiltro}
            scope={escopo(filtroMaisVendidos, setFiltroMaisVendidos)}
          />
        ),
      },
      {
        id: "giroBaixo",
        titulo: blocosCopy.giroBaixo.titulo,
        icone: TrendingDown,
        accent: "var(--acento-3)",
        carregando: giroBaixo.carregando,
        semFiltro: giroBaixo.semFiltro,
        resumo: {
          valor: giroBaixo.dados ? String(giroBaixo.dados.giroBaixo.length) : null,
          legenda: blocosCopy.giroBaixo.legenda,
        },
        render: () => (
          <GiroBaixoCard
            itens={giroBaixo.dados?.giroBaixo ?? null}
            carregando={giroBaixo.carregando}
            semFiltro={giroBaixo.semFiltro}
            scope={escopo(filtroGiroBaixo, setFiltroGiroBaixo)}
          />
        ),
      },
      {
        id: "parados",
        titulo: blocosCopy.parados.titulo,
        icone: Hourglass,
        accent: "var(--muted-foreground)",
        carregando: parados.carregando,
        semFiltro: parados.semFiltro,
        resumo: {
          valor: parados.dados ? String(parados.dados.parados.length) : null,
          legenda: blocosCopy.parados.legenda,
          alerta: parados.dados && parados.dados.parados.length > 0 ? { nivel: "atencao", texto: "parados" } : null,
        },
        render: () => (
          <ParadosCard
            itens={parados.dados?.parados ?? null}
            carregando={parados.carregando}
            semFiltro={parados.semFiltro}
            scope={escopo(filtroParados, setFiltroParados)}
          />
        ),
      },
      {
        id: "posVenda",
        titulo: blocosCopy.posVenda.titulo,
        icone: MessageSquare,
        accent: "var(--warning)",
        resumo: { valor: null, legenda: blocosCopy.posVenda.legenda },
        render: () => <PosVendaCard inicio={inicio ?? diasAtras(29)} fim={fim ?? hoje} />,
      },
      {
        id: "acoes",
        titulo: blocosCopy.acoes.titulo,
        icone: Sparkles,
        accent: "var(--acento-1)",
        resumo: { valor: null, legenda: blocosCopy.acoes.legenda },
        render: () => <AcoesCard />,
      },
    ];

    /* Os dois abaixo só existem com dado: Evolução precisa de uma janela
       anterior para comparar, e Publicações precisa de marca conectada. Bloco
       que abriria vazio não vira bloco. */
    if (saude.dados) {
      lista.splice(6, 0, {
        id: "evolucao",
        titulo: blocosCopy.evolucao.titulo,
        icone: BarChart3,
        accent: "var(--acento-2)",
        resumo: { valor: null, legenda: blocosCopy.evolucao.legenda },
        render: () => (
          <ComparacaoPeriodoCard atual={saude.dados!} anterior={anterior.chave === chave ? anterior.dados : null} />
        ),
      });
    }

    if (marcasPublicacoes.length > 0) {
      lista.push({
        id: "publicacoes",
        titulo: blocosCopy.publicacoes.titulo,
        icone: Megaphone,
        accent: "var(--acento-3)",
        resumo: { valor: null, legenda: blocosCopy.publicacoes.legenda },
        render: () => (
          <PublicacoesCard
            marcas={marcasPublicacoes.map((marca) => ({ brandId: marca.brandId, marcaLabel: marca.marcaLabel, slug: marca.marca }))}
            inicio={inicio ?? diasAtras(29)}
            fim={fim ?? hoje}
          />
        ),
      });
    }

    return ordenarPorUrgencia(lista);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dadosFaturamento, faturamento.carregando, faturamento.semFiltro, filtroFaturamento, coresFaturamento,
    saude.dados, carregandoSaude, anterior, chave, marcasPublicacoes,
    reclamacoesVisiveis, carregandoReclamacoes, semFiltroReclamacoes, filtroReclamacoes,
    reposicao, filtroReposicao, maisVendidos, filtroMaisVendidos, giroBaixo, filtroGiroBaixo, parados, filtroParados,
    atendimento.dados, carregandoAtendimento, periodo, inicio, fim, marcas, canais,
  ]);

  /* ── Foco ─────────────────────────────────────────────────────── */

  const indiceAberto = blocos.findIndex((bloco) => bloco.id === cardAberto);
  const blocoAberto = indiceAberto >= 0 ? blocos[indiceAberto] : null;

  /* O card aberto vive na URL: recarregar, favoritar e o botão voltar do
     navegador passam a funcionar de graça. `replace` porque abrir e fechar
     card não merece uma entrada de histórico cada. */
  const abrir = useCallback((id: string) => {
    router.replace(`/metricas?card=${id}`, { scroll: false });
  }, [router]);

  const fechar = useCallback(() => {
    router.replace("/metricas", { scroll: false });
  }, [router]);

  const pular = useCallback((passo: number) => {
    if (blocos.length === 0 || indiceAberto < 0) return;
    const proximo = (indiceAberto + passo + blocos.length) % blocos.length;
    abrir(blocos[proximo].id);
  }, [blocos, indiceAberto, abrir]);

  // Um ?card= que não existe (link antigo, bloco que sumiu com o filtro) fica
  // como um parâmetro morto na URL em vez de abrir nada — limpa sozinho.
  useEffect(() => {
    if (cardAberto && indiceAberto < 0 && blocos.length > 0) fechar();
  }, [cardAberto, indiceAberto, blocos.length, fechar]);

  return (
    <>
      <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-4">
        {marcas.length > 0 && <CoachMarks storageKey="crm-leo:coachmarks:mosaico:v1" steps={TOUR} />}

        {/* Período e exportar ficam fixos no topo, e continuam alcançáveis com
            um card aberto — trocar a janela não exige fechar nada. */}
        <div className="sticky top-0 z-30 -mx-1 flex flex-wrap items-center gap-2 bg-background/85 px-1 py-2 backdrop-blur" data-coachmark="mosaico-periodo">
          <span className="text-label-md uppercase text-muted-foreground">{copy.periodoLabel}</span>
          <CalendarioPopover
            rotulo="De:"
            valor={periodo.inicio}
            max={periodo.fim || hoje}
            onChange={(valor) => trocarDatas(valor, periodo.fim)}
            disabled={carregandoSaude}
          />
          <CalendarioPopover
            rotulo="Até:"
            valor={periodo.fim}
            min={periodo.inicio}
            max={hoje}
            onChange={(valor) => trocarDatas(periodo.inicio, valor)}
            disabled={carregandoSaude}
            atraso={0.04}
          />
          <span className="text-[11px] text-muted-foreground">
            {completo ? saude.dados?.periodoLabel ?? "" : copy.periodoPadrao}
          </span>
          <span className="hidden h-px flex-1 bg-border sm:block" />

          <motion.button
            type="button"
            onClick={exportar}
            disabled={exportando || !saude.dados}
            whileHover={saude.dados ? { scale: 1.03 } : undefined}
            whileTap={saude.dados ? { scale: 0.97 } : undefined}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[0.75rem] border border-border px-3 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
          >
            <FileText size={13} />
            {exportando ? metricasConfig.exportacao.gerando : metricasConfig.exportacao.acao}
          </motion.button>
        </div>

        <ul
          data-coachmark="mosaico-grade"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {blocos.map((bloco) => (
            <Bloco key={bloco.id} def={bloco} focado={bloco.id === cardAberto} onAbrir={() => abrir(bloco.id)} />
          ))}
        </ul>
      </motion.div>

      {/* Atalho de escopo: some sozinho, e some de vez assim que não há bloco
          vazio para preencher. A escolha que dispara isto agora só acontece
          dentro do card aberto (o mosaico não tem mais pílula nenhuma), então
          o aviso precisa ficar acima do painel de foco (z-50) para aparecer —
          senão nasce escondido atrás dele. */}
      <AnimatePresence>
        {sugestao && filtrosVazios > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="fixed inset-x-0 bottom-20 z-[60] mx-auto flex w-fit max-w-[92vw] items-center gap-3 rounded-full border border-border bg-card px-4 py-2 shadow-[0_8px_28px_rgba(14,15,19,.16)] sm:bottom-6"
          >
            <span className="hidden text-[11px] text-muted-foreground sm:inline">{copy.usarEmTodosDica}</span>
            <button
              type="button"
              onClick={() => aplicarEmTodos(sugestao)}
              className="press-feedback whitespace-nowrap rounded-full bg-foreground px-3 py-1.5 text-[12px] font-semibold text-background"
            >
              {copy.usarEmTodos}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <Foco
        def={blocoAberto}
        onFechar={fechar}
        onAnterior={() => pular(-1)}
        onProximo={() => pular(1)}
        posicao={copy.posicao
          .replace("{atual}", String(indiceAberto + 1))
          .replace("{total}", String(blocos.length))}
      />
    </>
  );
}
