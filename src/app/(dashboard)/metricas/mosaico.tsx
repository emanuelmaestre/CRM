"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import {
  AlertTriangle, BarChart3, Gauge, Hourglass, MessageSquare, Megaphone,
  Package, RefreshCw, ShoppingBag, Sparkles, Store, Timer, TrendingDown, TrendingUp,
} from "lucide-react";
import { CalendarioPopover } from "@/shared/design-system/primitives/CalendarioPopover";
import { BotaoHoje } from "@/shared/design-system/primitives/BotaoHoje";
import { CoachMarks, type CoachMarkStep } from "@/shared/design-system/primitives/CoachMarks";
import { stagger } from "@/shared/design-system/motion-variants";
import { getBrandConfig, isBrandSlug } from "@/shared/config/brands";
import { channelAccent } from "@/shared/design-system/primitives/ChannelLogo";
import metricasConfig from "@/config/metricas.json";

import { agruparPorSecao, Bloco, Foco, RotuloSecao, type BlocoDef } from "./bloco";
import { ScopeRow, type CardFiltro, type ScopeCanal, type ScopeMarca } from "./painel/scope-row";
import { type Periodo } from "./metricas-primitives";
import { FaturamentoCard } from "./painel/faturamento-card";
import { GiroBaixoCard, MaisVendidosCard, ParadosCard, ReposicaoCard } from "./painel/listas-cards";
import { ReclamacoesCard } from "./painel/reclamacoes-card";
import { actionObterDashboardData, actionObterReclamacoes } from "./painel/actions";
import { actionContarPedidosPorCanal, actionContarPedidosPorMarca } from "../vendas/actions";
import {
  actionListarInsights, actionListarSugestoes, actionObterAtendimento,
  actionObterDesempenhoPublicacoes, actionObterPosVenda, actionObterSaudeLoja,
} from "./actions";
import { AcoesCard, type Insight, type Sugestao } from "./acoes-card";
import { AtendimentoCard } from "./atendimento-card";
import { ComparacaoCard } from "./comparacao-card";
import { ComparacaoPeriodoCard } from "./comparacao-periodo-card";
import { PosVendaCard } from "./pos-venda-card";
import { PublicacoesCard, type DesempenhoPreCarregado } from "./publicacoes-card";
import { ReputacaoCard } from "./reputacao-card";
import { ScoreCard } from "./score-card";
import type { DashboardData } from "@/modules/metricas/application/dashboard.service";
import type { ReclamacoesResultado } from "@/modules/metricas/application/reclamacoes.service";
import type { SaudeLojaResultado } from "@/modules/metricas/application/saude-loja.service";
import type { AtendimentoResumo } from "@/modules/metricas/application/atendimento.service";
import type { PosVendaResultado } from "@/modules/metricas/application/pos-venda.service";

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

/* ── Barra de período ───────────────────────────────────────────────
   Mora aqui, e não só no topo do mosaico, porque desde que o painel de foco
   virou tela cheia ele cobre essa barra por completo — sem redesenhá-la
   também dentro do Foco, trocar o período com um card aberto exigiria
   fechar primeiro. As duas instâncias leem e escrevem o mesmo estado
   (props vindas de `Mosaico`), então nunca desincronizam.

   O topo do mosaico não mostra mais isto — só um "atualizado às" discreto
   (ver `Mosaico`). Calendário e "Hoje" agora só existem aqui dentro do card
   aberto: exportar em PDF saiu por completo (o botão exportava sempre o
   mesmo resumo Score+Atendimento+Pós-venda, sem relação com o card em
   foco — decisão tomada com o usuário). */
const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

function BarraPeriodo({ periodo, trocarDatas, carregandoSaude, completo, periodoLabel }: {
  periodo: Periodo;
  trocarDatas: (inicio: string, fim: string) => void;
  carregandoSaude: boolean;
  completo: boolean;
  periodoLabel?: string;
}) {
  return (
    <>
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
      <BotaoHoje
        ativo={periodo.inicio === hoje && periodo.fim === hoje}
        disabled={carregandoSaude}
        onClick={() => trocarDatas(hoje, hoje)}
      />
      <span className="text-[11px] text-muted-foreground">
        {completo ? periodoLabel ?? "" : copy.periodoPadrao}
      </span>
    </>
  );
}

const TOUR: CoachMarkStep[] = [
  {
    target: '[data-coachmark="mosaico-grade"]',
    title: "Clique em qualquer bloco",
    description: "Ele cresce e vira o card completo — é lá dentro que ficam De:/Até:/Hoje, e vale para o mosaico inteiro. Esc volta, ← → pulam de card.",
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
        if (!ativo) return;
        // `semContaConectada: false` aqui seria mentir — o card leria isso como
        // "conta conectada, zero reclamações" quando na verdade a busca falhou.
        // O toast é o que diferencia as duas leituras para quem está olhando.
        setReclamacoes({ itens: [], total: 0, marcasComFalha: [], semContaConectada: false });
        toast.error(metricasConfig.erros.carregar, { id: "metricas-reclamacoes" });
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
  // Sem timestamp único de servidor pra "isto tudo" — o mosaico é a soma de
  // ~7 buscas independentes (ver comentário acima sobre cada uma carregar no
  // próprio ritmo). Saúde da loja é o gatilho mais representativo porque
  // alimenta a maioria dos cards, então marca "última atualização" quando
  // ela responde — setado no próprio .then(), não num efeito à parte, pra
  // não disparar um segundo render encadeado à toa.
  const [carregadoEm, setCarregadoEm] = useState<Date | null>(null);

  useEffect(() => {
    let ativo = true;
    actionObterSaudeLoja({ inicio, fim })
      .then((resultado) => { if (ativo) { setSaude({ chave, dados: resultado }); setCarregadoEm(new Date()); } })
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
    actionObterSaudeLoja({ inicio: paraDataInput(inicioAnterior), fim: paraDataInput(fimAnterior), leve: true })
      .then((dados) => { if (ativo) setAnterior({ chave, dados }); })
      .catch(() => {
        if (!ativo) return;
        setAnterior({ chave, dados: null });
        toast.error(metricasConfig.erros.carregar, { id: "metricas-anterior" });
      });
    return () => { ativo = false; };
  }, [chave, inicio, fim]);

  useEffect(() => {
    let ativo = true;
    actionObterAtendimento({ inicio, fim })
      .then((resultado) => { if (ativo) setAtendimento({ chave, dados: resultado }); })
      .catch(() => {
        if (!ativo) return;
        setAtendimento({ chave, dados: null });
        toast.error(metricasConfig.erros.carregar, { id: "metricas-atendimento" });
      });
    return () => { ativo = false; };
  }, [chave, inicio, fim]);

  const carregandoSaude = saude.chave !== chave;
  const carregandoAtendimento = atendimento.chave !== chave;

  /* ── Pós-venda, Recomendações e Publicações (1ª marca) ──
     Esses três buscavam de dentro do próprio card, e o card só montava
     quando o bloco abria — cada clique esperava uma ida ao servidor, e
     fechar e reabrir refazia a busca do zero. Aqui a busca sobe para o
     mosaico, dispara junto com Saúde da loja e Atendimento assim que a
     página carrega, e os cards viram (quase) só apresentação. */
  const [posVenda, setPosVenda] = useState<{ chave: string; dados: PosVendaResultado | null }>({ chave: "", dados: null });
  useEffect(() => {
    let ativo = true;
    actionObterPosVenda({ inicio, fim })
      .then((dados) => { if (ativo) setPosVenda({ chave, dados }); })
      .catch(() => {
        if (!ativo) return;
        setPosVenda({ chave, dados: null });
        toast.error(metricasConfig.erros.carregar, { id: "metricas-posvenda" });
      });
    return () => { ativo = false; };
  }, [chave, inicio, fim]);
  const carregandoPosVenda = posVenda.chave !== chave;

  const [acoes, setAcoes] = useState<{ carregado: boolean; insights: Insight[]; sugestoes: Sugestao[] }>({
    carregado: false, insights: [], sugestoes: [],
  });
  useEffect(() => {
    let ativo = true;
    Promise.all([actionListarInsights(), actionListarSugestoes()])
      .then(([insights, sugestoes]) => { if (ativo) setAcoes({ carregado: true, insights, sugestoes }); })
      .catch(() => { if (ativo) setAcoes({ carregado: true, insights: [], sugestoes: [] }); });
    return () => { ativo = false; };
  }, []);

  // Só a primeira marca (a aba padrão do card) — trocar de aba com o card já
  // aberto continua buscando na hora, é uma escolha de quem já está olhando.
  const [publicacoes, setPublicacoes] = useState<DesempenhoPreCarregado | null>(null);
  const primeiraMarcaPublicacoes = saude.dados?.marcas[0]?.brandId ?? null;
  useEffect(() => {
    if (!primeiraMarcaPublicacoes) return;
    const inicioEfetivo = inicio ?? diasAtras(29);
    const fimEfetivo = fim ?? hoje;
    let ativo = true;
    actionObterDesempenhoPublicacoes({ brandId: primeiraMarcaPublicacoes, inicio: inicioEfetivo, fim: fimEfetivo })
      .then((dados) => { if (ativo) setPublicacoes({ brandId: primeiraMarcaPublicacoes, inicio: inicioEfetivo, fim: fimEfetivo, dados }); })
      .catch(() => { if (ativo) setPublicacoes({ brandId: primeiraMarcaPublicacoes, inicio: inicioEfetivo, fim: fimEfetivo, dados: null }); });
    return () => { ativo = false; };
  }, [primeiraMarcaPublicacoes, inicio, fim]);

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

  /* ── Blocos ───────────────────────────────────────────────────────
     Um bloco (ou grupo de blocos vizinhos) por memo, cada um com a própria
     lista de dependências — pequena o bastante para o linter conferir
     sozinha, sem eslint-disable. Antes disso os 14 blocos viviam num único
     useMemo com ~25 dependências escritas à mão: qualquer clique de filtro
     reprocessava a lista inteira, e uma dependência esquecida ali vira bug
     silencioso (closure presa em dado antigo) que o linter não pega. */

  const escopo = useCallback((filtro: CardFiltro, definir: (valor: CardFiltro) => void, comCanais = true) => (
    <ScopeRow marcas={marcas} canais={comCanais ? canais : []} filtro={filtro} onChange={comSugestao(definir)} />
  ), [marcas, canais, comSugestao]);

  const dadosFaturamento = faturamento.dados?.faturamento ?? null;
  // `?? []` sozinho cria um array novo a cada render mesmo com `saude.dados`
  // estável — o memo abaixo prende a mesma referência enquanto `marcas` não
  // muda de fato, para não invalidar o bloco de Publicações à toa.
  const marcasPublicacoes = useMemo(() => saude.dados?.marcas ?? [], [saude.dados]);

  const blocoFaturamento = useMemo<BlocoDef>(() => ({
    id: "faturamento",
    secao: "financeiro",
    titulo: blocosCopy.faturamento.titulo,
    icone: TrendingUp,
    accent: "var(--acento-2)",
    largura: 2,
    carregando: faturamento.carregando,
    semFiltro: faturamento.semFiltro,
    resumo: {
      valor: dadosFaturamento?.total ?? null,
      variacao: dadosFaturamento?.variacaoPercentual ?? null,
      legenda: dadosFaturamento
        ? blocosCopy.faturamento.legenda
            .replace("{pedidos}", String(dadosFaturamento.pedidos))
            .replace("{ticket}", dadosFaturamento.ticketMedio)
        : blocosCopy.faturamento.legenda,
    },
    subtitulo: dadosFaturamento?.janelaLabel,
    render: () => (
      <FaturamentoCard
        dados={dadosFaturamento}
        carregando={faturamento.carregando}
        semFiltro={faturamento.semFiltro}
        cores={coresFaturamento}
        scope={escopo(filtroFaturamento, setFiltroFaturamento)}
      />
    ),
  }), [dadosFaturamento, faturamento.carregando, faturamento.semFiltro, filtroFaturamento, coresFaturamento, escopo]);

  const blocoScore = useMemo<BlocoDef>(() => ({
    id: "score",
    secao: "saude",
    titulo: blocosCopy.score.titulo,
    icone: Gauge,
    // Enquanto não há dado, cai na mesma cor fixa que score-card.tsx usa no
    // próprio cabeçalho (ACENTO) — antes esse fallback divergia da cor real
    // do card. Com dado, o score manda: a cor representa a saúde atual, não
    // uma identidade fixa.
    accent: saude.dados?.faixaGeralCor ?? "var(--acento-2)",
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
    subtitulo: saude.dados ? `${metricasConfig.score.subtitulo} · ${saude.dados.periodoLabel}` : metricasConfig.score.subtitulo,
    render: (acaoSlot) => <ScoreCard dados={saude.dados} carregando={carregandoSaude} acaoSlot={acaoSlot} />,
  }), [saude.dados, carregandoSaude]);

  const blocoReputacao = useMemo<BlocoDef>(() => ({
    id: "reputacao",
    secao: "saude",
    titulo: blocosCopy.reputacao.titulo,
    icone: Store,
    // Mesma cor do ACENTO em reputacao-card.tsx — divergiam (tile e card
    // aberto mostravam cores diferentes para o mesmo bloco).
    accent: "var(--acento-1)",
    carregando: carregandoSaude,
    resumo: {
      valor: null,
      legenda: saude.dados?.reputacaoIndisponivel ? metricasConfig.reputacaoCard.semTermometro : blocosCopy.reputacao.legenda,
    },
    // Não usa o período escolhido no seletor: o Mercado Livre não deixa
    // recortar a janela do termômetro (vem fixa por métrica, 60 ou 365 dias).
    // Rotular com o período do filtro sugeriria que mudar a data muda o
    // número aqui, o que nunca acontece.
    subtitulo: metricasConfig.reputacaoCard.subtituloJanelaPropria,
    render: () => <ReputacaoCard dados={saude.dados} carregando={carregandoSaude} />,
  }), [saude.dados, carregandoSaude]);

  const blocoComparacao = useMemo<BlocoDef>(() => ({
    id: "comparacao",
    secao: "financeiro",
    titulo: blocosCopy.comparacao.titulo,
    icone: BarChart3,
    // Mesma cor do ACENTO em comparacao-card.tsx.
    accent: "var(--acento-3)",
    carregando: carregandoSaude,
    resumo: {
      valor: saude.dados ? String(saude.dados.marcas.length) : null,
      legenda: blocosCopy.comparacao.legenda,
    },
    subtitulo: metricasConfig.comparacaoCard.subtitulo,
    render: (acaoSlot) => <ComparacaoCard dados={saude.dados} carregando={carregandoSaude} acaoSlot={acaoSlot} />,
  }), [saude.dados, carregandoSaude]);

  // Só existe com dado: Evolução precisa de uma janela anterior para
  // comparar, e um bloco que abriria vazio não vira bloco.
  const blocoEvolucao = useMemo<BlocoDef | null>(() => {
    if (!saude.dados) return null;
    return {
      id: "evolucao",
    secao: "financeiro",
      titulo: blocosCopy.evolucao.titulo,
      icone: BarChart3,
      accent: "var(--acento-2)",
      resumo: { valor: null, legenda: blocosCopy.evolucao.legenda },
      subtitulo: "Mesma duração, imediatamente anterior ao intervalo selecionado",
      render: () => (
        <ComparacaoPeriodoCard atual={saude.dados!} anterior={anterior.chave === chave ? anterior.dados : null} />
      ),
    };
  }, [saude.dados, anterior, chave]);

  const blocoReclamacoes = useMemo<BlocoDef>(() => ({
    id: "reclamacoes",
    secao: "atendimento",
    titulo: blocosCopy.reclamacoes.titulo,
    icone: AlertTriangle,
    accent: "var(--destructive)",
    carregando: carregandoReclamacoes,
    semFiltro: semFiltroReclamacoes,
    resumo: {
      valor: reclamacoesVisiveis ? String(reclamacoesVisiveis.total) : null,
      legenda: blocosCopy.reclamacoes.legenda,
      alerta: reclamacoesVisiveis && reclamacoesVisiveis.total > 0
        ? { nivel: "critico", texto: "abertas" }
        : null,
    },
    subtitulo: "Casos abertos no Mercado Livre",
    render: (acaoSlot) => (
      <ReclamacoesCard
        dados={reclamacoesVisiveis}
        carregando={carregandoReclamacoes}
        semFiltro={semFiltroReclamacoes}
        // Sem pílulas de canal: o Mercado Livre não separa reclamação por
        // canal de venda, então filtrar por canal aqui não mudaria nada.
        scope={escopo(filtroReclamacoes, setFiltroReclamacoes, false)}
        acaoSlot={acaoSlot}
      />
    ),
  }), [reclamacoesVisiveis, carregandoReclamacoes, semFiltroReclamacoes, filtroReclamacoes, escopo]);

  const blocoReposicao = useMemo<BlocoDef>(() => ({
    id: "reposicao",
    secao: "estoque",
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
    subtitulo: "Ainda acima do mínimo — dá tempo de comprar",
    render: () => (
      <ReposicaoCard
        itens={reposicao.dados?.reposicao ?? null}
        carregando={reposicao.carregando}
        semFiltro={reposicao.semFiltro}
        scope={escopo(filtroReposicao, setFiltroReposicao)}
      />
    ),
  }), [reposicao, filtroReposicao, escopo]);

  const blocoAtendimento = useMemo<BlocoDef>(() => ({
    id: "atendimento",
    secao: "atendimento",
    titulo: blocosCopy.atendimento.titulo,
    icone: Timer,
    // Mesma cor do ACENTO em atendimento-card.tsx.
    accent: "var(--acento-1)",
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
    subtitulo: metricasConfig.atendimentoCard.subtitulo,
    render: () => <AtendimentoCard dados={atendimento.dados} carregando={carregandoAtendimento} />,
  }), [atendimento.dados, carregandoAtendimento]);

  const blocoMaisVendidos = useMemo<BlocoDef>(() => ({
    id: "maisVendidos",
    secao: "estoque",
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
    subtitulo: "Campeões de saída no período",
    render: () => (
      <MaisVendidosCard
        itens={maisVendidos.dados?.maisVendidos ?? null}
        carregando={maisVendidos.carregando}
        semFiltro={maisVendidos.semFiltro}
        scope={escopo(filtroMaisVendidos, setFiltroMaisVendidos)}
      />
    ),
  }), [maisVendidos, filtroMaisVendidos, escopo]);

  const blocoGiroBaixo = useMemo<BlocoDef>(() => ({
    id: "giroBaixo",
    secao: "estoque",
    titulo: blocosCopy.giroBaixo.titulo,
    icone: TrendingDown,
    accent: "var(--acento-3)",
    carregando: giroBaixo.carregando,
    semFiltro: giroBaixo.semFiltro,
    resumo: {
      valor: giroBaixo.dados ? String(giroBaixo.dados.giroBaixo.length) : null,
      legenda: blocosCopy.giroBaixo.legenda,
    },
    subtitulo: "Vendem pouco ou nada no período",
    render: () => (
      <GiroBaixoCard
        itens={giroBaixo.dados?.giroBaixo ?? null}
        carregando={giroBaixo.carregando}
        semFiltro={giroBaixo.semFiltro}
        scope={escopo(filtroGiroBaixo, setFiltroGiroBaixo)}
      />
    ),
  }), [giroBaixo, filtroGiroBaixo, escopo]);

  const blocoParados = useMemo<BlocoDef>(() => ({
    id: "parados",
    secao: "estoque",
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
    subtitulo: "Sem nenhuma saída há mais de 90 dias",
    render: () => (
      <ParadosCard
        itens={parados.dados?.parados ?? null}
        carregando={parados.carregando}
        semFiltro={parados.semFiltro}
        scope={escopo(filtroParados, setFiltroParados)}
      />
    ),
  }), [parados, filtroParados, escopo]);

  const blocoPosVenda = useMemo<BlocoDef>(() => ({
    id: "posVenda",
    secao: "atendimento",
    titulo: blocosCopy.posVenda.titulo,
    icone: MessageSquare,
    accent: "var(--warning)",
    resumo: { valor: null, legenda: blocosCopy.posVenda.legenda },
    subtitulo: "Cancelamentos, devoluções e impacto financeiro do período",
    render: () => <PosVendaCard dados={posVenda.dados} carregando={carregandoPosVenda} />,
  }), [posVenda.dados, carregandoPosVenda]);

  const blocoAcoes = useMemo<BlocoDef>(() => ({
    id: "acoes",
    secao: "marketing",
    titulo: blocosCopy.acoes.titulo,
    icone: Sparkles,
    accent: "var(--acento-1)",
    resumo: { valor: null, legenda: blocosCopy.acoes.legenda },
    subtitulo: metricasConfig.acoesCard.subtitulo,
    render: () => (
      <AcoesCard
        insightsIniciais={acoes.insights}
        sugestoesIniciais={acoes.sugestoes}
        carregandoInicial={!acoes.carregado}
      />
    ),
  }), [acoes]);

  // Só existe com marca conectada — um bloco que abriria vazio não vira bloco.
  const blocoPublicacoes = useMemo<BlocoDef | null>(() => {
    if (marcasPublicacoes.length === 0) return null;
    return {
      id: "publicacoes",
    secao: "marketing",
      titulo: blocosCopy.publicacoes.titulo,
      icone: Megaphone,
      accent: "var(--acento-3)",
      resumo: { valor: null, legenda: blocosCopy.publicacoes.legenda },
      render: (acaoSlot) => (
        <PublicacoesCard
          marcas={marcasPublicacoes.map((marca) => ({ brandId: marca.brandId, marcaLabel: marca.marcaLabel, slug: marca.marca }))}
          inicio={inicio ?? diasAtras(29)}
          fim={fim ?? hoje}
          preCarregado={publicacoes}
          acaoSlot={acaoSlot}
        />
      ),
    };
  }, [marcasPublicacoes, inicio, fim, publicacoes]);

  // Junta, separa em seções (Financeiro / Saúde / Atendimento / Estoque /
  // Marketing) e ordena por urgência dentro de cada uma — o trabalho pesado
  // (recriar cada bloco) já aconteceu nos memos acima, isolado por grupo.
  const { grupos, lista: blocos } = useMemo(() => agruparPorSecao([
    blocoFaturamento, blocoScore, blocoReclamacoes, blocoReposicao, blocoReputacao, blocoComparacao,
    ...(blocoEvolucao ? [blocoEvolucao] : []),
    blocoAtendimento, blocoMaisVendidos, blocoGiroBaixo, blocoParados, blocoPosVenda, blocoAcoes,
    ...(blocoPublicacoes ? [blocoPublicacoes] : []),
  ]), [
    blocoFaturamento, blocoScore, blocoReclamacoes, blocoReposicao, blocoReputacao, blocoComparacao,
    blocoEvolucao, blocoAtendimento, blocoMaisVendidos, blocoGiroBaixo, blocoParados, blocoPosVenda, blocoAcoes,
    blocoPublicacoes,
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
      <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-3">
        {marcas.length > 0 && <CoachMarks storageKey="crm-leo:coachmarks:mosaico:v1" steps={TOUR} />}

        {/* Período, "Hoje" e exportar saíram do topo do mosaico — só fazem
            sentido dentro de um card aberto (ver `Foco` mais abaixo), onde
            o dado que eles afetam está de fato na tela. Aqui em cima sobra
            só a informação passiva: quando os números foram buscados. */}
        {carregadoEm && (
          <div className="sticky top-0 z-30 flex justify-end bg-background/85 px-1 py-1.5 backdrop-blur md:top-14 [@media_(min-width:768px)_and_(max-height:500px)]:top-0">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <RefreshCw size={11} />
              Atualizado às {dataHora.format(carregadoEm)}
            </span>
          </div>
        )}

        {/* 5 seções em vez de uma grade só de 14 — cada uma com o próprio
            rótulo e a própria ordenação por urgência (ver agruparPorSecao em
            bloco.tsx). Um bloco com alerta sobe dentro do grupo dele, não
            para cima do mosaico inteiro; o rótulo da seção ganha um ponto na
            cor do pior alerta, então dá pra saber onde olhar antes de abrir
            qualquer coisa. */}
        <div data-coachmark="mosaico-grade" className="flex flex-col gap-3.5">
          {grupos.map((grupo) => (
            <section key={grupo.id} className="flex flex-col gap-2">
              <RotuloSecao label={grupo.label} alerta={grupo.alerta} />
              <ul className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                {grupo.blocos.map((bloco) => (
                  <Bloco key={bloco.id} def={bloco} focado={bloco.id === cardAberto} onAbrir={() => abrir(bloco.id)} />
                ))}
              </ul>
            </section>
          ))}
        </div>
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
            role="status"
            aria-live="polite"
            className="fixed inset-x-0 bottom-[calc(5.5rem_+_env(safe-area-inset-bottom))] z-[60] mx-auto flex w-fit max-w-[92vw] items-center gap-3 rounded-full border border-border bg-card px-4 py-2 shadow-[0_8px_28px_rgba(14,15,19,.16)] sm:bottom-6"
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
        barraPeriodo={
          <BarraPeriodo
            periodo={periodo}
            trocarDatas={trocarDatas}
            carregandoSaude={carregandoSaude}
            completo={completo}
            periodoLabel={saude.dados?.periodoLabel}
          />
        }
      />
    </>
  );
}
