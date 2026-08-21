"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import {
  AlertTriangle, BarChart3, Gauge, Hourglass, Megaphone,
  Package, RefreshCw, ShoppingBag, Sparkles, TrendingDown, TrendingUp,
} from "lucide-react";
import { CoachMarks, type CoachMarkStep } from "@/shared/design-system/primitives/CoachMarks";
import { stagger } from "@/shared/design-system/motion-variants";
import { getBrandConfig, isBrandSlug } from "@/shared/config/brands";
import { channelAccent } from "@/shared/design-system/primitives/ChannelLogo";
import metricasConfig from "@/config/metricas.json";

import { agruparPorSecao, Bloco, Foco, RotuloSecao, type BlocoDef } from "./bloco";
import { ScopeRow, type CardFiltro, type ScopeCanal, type ScopeMarca } from "./painel/scope-row";
import { type Periodo } from "./metricas-primitives";
import { actionObterDashboardData, actionObterReclamacoes } from "./painel/actions";
import { actionObterFiltrosPedidos } from "../vendas/actions";
import {
  actionListarInsights, actionListarSugestoes,
  actionObterPosVenda, actionObterSaudeLoja,
} from "./actions";
import type { Insight, Sugestao } from "./acoes-card";
import type { DashboardData } from "@/modules/metricas/application/dashboard.service";
import type { ReclamacoesResultado } from "@/modules/metricas/application/reclamacoes.service";
import type { SaudeLojaResultado } from "@/modules/metricas/application/saude-loja.service";
import type { PosVendaResultado } from "@/modules/metricas/application/pos-venda.service";

const copy = metricasConfig.mosaico;
const blocosCopy = copy.blocos;

const FILTRO_PADRAO: CardFiltro = { brandId: [], canal: [] };

function PainelCarregando() {
  return <div className="shimmer h-52 w-full rounded-[1.25rem] bg-muted" role="status" aria-label="Carregando painel" />;
}

const CalendarioPopoverRange = dynamic(() => import("@/shared/design-system/primitives/CalendarioPopoverRange").then((modulo) => modulo.CalendarioPopoverRange));
const BotaoHoje = dynamic(() => import("@/shared/design-system/primitives/BotaoHoje").then((modulo) => modulo.BotaoHoje));
const FaturamentoCard = dynamic(() => import("./painel/faturamento-card").then((modulo) => modulo.FaturamentoCard), { loading: PainelCarregando });
const ReclamacoesCard = dynamic(() => import("./painel/reclamacoes-card").then((modulo) => modulo.ReclamacoesCard), { loading: PainelCarregando });
const AcoesCard = dynamic(() => import("./acoes-card").then((modulo) => modulo.AcoesCard), { loading: PainelCarregando });
const ComparacaoCard = dynamic(() => import("./comparacao-card").then((modulo) => modulo.ComparacaoCard), { loading: PainelCarregando });
const PublicacoesCard = dynamic(() => import("./publicacoes-card").then((modulo) => modulo.PublicacoesCard), { loading: PainelCarregando });
const ScoreCard = dynamic(() => import("./score-card").then((modulo) => modulo.ScoreCard), { loading: PainelCarregando });
const GiroBaixoCard = dynamic(() => import("./painel/listas-cards").then((modulo) => modulo.GiroBaixoCard), { loading: PainelCarregando });
const MaisVendidosCard = dynamic(() => import("./painel/listas-cards").then((modulo) => modulo.MaisVendidosCard), { loading: PainelCarregando });
const ParadosCard = dynamic(() => import("./painel/listas-cards").then((modulo) => modulo.ParadosCard), { loading: PainelCarregando });
const ReposicaoCard = dynamic(() => import("./painel/listas-cards").then((modulo) => modulo.ReposicaoCard), { loading: PainelCarregando });

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
          toast.error("Não foi possível carregar este painel.", { id: chave });
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

function BarraPeriodo({ periodo, trocarDatas, periodoLabel, accent }: {
  periodo: Periodo;
  trocarDatas: (inicio: string, fim: string) => void;
  periodoLabel?: string;
  /** Acento do card em foco — o calendário e o "Hoje" pintam com a mesma
   *  cor do ícone do card, em vez de um teal genérico igual para todos. */
  accent?: string;
}) {
  return (
    <>
      <CalendarioPopoverRange
        rotulo="Período"
        valor={{ inicio: periodo.inicio, fim: periodo.fim }}
        max={hoje}
        onChange={({ inicio, fim }) => trocarDatas(inicio, fim)}
        accent={accent}
      />
      <BotaoHoje
        ativo={periodo.inicio === hoje && periodo.fim === hoje}
        onClick={() => {
          const jaEstaEmHoje = periodo.inicio === hoje && periodo.fim === hoje;
          trocarDatas(jaEstaEmHoje ? "" : hoje, jaEstaEmHoje ? "" : hoje);
        }}
        className="hidden sm:inline-flex"
        accent={accent}
      />
      <span className="text-[11px] text-muted-foreground">
        {periodoLabel ?? ""}
      </span>
    </>
  );
}

const TOUR: CoachMarkStep[] = [
  {
    target: '[data-coachmark="mosaico-grade"]',
    title: "Clique em qualquer bloco",
    description: "Ele cresce e vira o painel completo. É nele que ficam De, Até e Hoje, e o período vale para todo o mosaico. Esc volta; as setas alternam entre os painéis.",
  },
];

/** Classes escritas por extenso (e não montadas em runtime) porque o
 *  Tailwind lê o código-fonte para saber quais classes gerar — uma string
 *  do tipo `lg:grid-cols-${n}` não existiria no CSS final. */
const COLUNAS_LG: Record<number, string> = {
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
  5: "lg:grid-cols-5",
  6: "lg:grid-cols-6",
};

/* ── Mosaico ───────────────────────────────────────────────────── */

export function Mosaico({
  marcasIniciais = [], canaisIniciais = [], saudeInicial = null,
  posVendaInicial = null, acoesIniciais = null,
}: {
  /* O mosaico é a soma de oito buscas independentes. Sete (todas menos
     Reclamações, que depende da API do Mercado Livre) são resolvidas no
     servidor e chegam dentro do HTML (ver page.tsx) — só Reclamações continua
     carregando no próprio ritmo pelo navegador. */
  marcasIniciais?: ScopeMarca[];
  canaisIniciais?: ScopeCanal[];
  saudeInicial?: SaudeLojaResultado | null;
  posVendaInicial?: PosVendaResultado | null;
  acoesIniciais?: { insights: Insight[]; sugestoes: Sugestao[] } | null;
}) {
  const params = useSearchParams();
  const cardAberto = params.get("card");

  const [periodo, setPeriodo] = useState<Periodo>({ inicio: hoje, fim: hoje });
  const [marcas, setMarcas] = useState<ScopeMarca[]>(marcasIniciais);
  const [canais, setCanais] = useState<ScopeCanal[]>(canaisIniciais);
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

  // Estas duas já vieram prontas do servidor quando há dado inicial — refazê-las
  // aqui só repetiria no navegador o que acabou de chegar no HTML.
  const primeirasContagens = useRef(marcasIniciais.length > 0 || canaisIniciais.length > 0);

  useEffect(() => {
    if (primeirasContagens.current) { primeirasContagens.current = false; return; }
    actionObterFiltrosPedidos()
      .then((resultado) => { setMarcas(resultado.marcas); setCanais(resultado.canais); })
      .catch(() => { setMarcas([]); setCanais([]); });
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
        setReclamacoes({ itens: [], total: 0, pendentes: 0, marcasComFalha: [], semContaConectada: false });
        toast.error(metricasConfig.erros.carregar, { id: "metricas-reclamacoes" });
      })
      .finally(() => { if (ativo) setCarregandoReclamacoes(false); });
    return () => { ativo = false; };
  }, []);

  /* ── Saúde da loja e atendimento ── */

  const completo = Boolean(periodo.inicio && periodo.fim);
  const inicio = completo ? periodo.inicio : undefined;
  const fim = completo ? periodo.fim : undefined;
  const chave = `${inicio ?? ""}..${fim ?? ""}`;

  // A chave inicial é hoje..hoje: o período começa em "Hoje" (mesmo default
  // do estado `periodo` acima), e é exatamente essa janela que o servidor
  // pré-buscou (ver page.tsx) — bater as duas evita um refetch à toa no
  // primeiro carregamento.
  const [saude, setSaude] = useState<{ chave: string; dados: SaudeLojaResultado | null }>(
    saudeInicial ? { chave: `${hoje}..${hoje}`, dados: saudeInicial } : { chave: "", dados: null },
  );
  // Sem timestamp único de servidor pra "isto tudo" — o mosaico é a soma de
  // ~7 buscas independentes (ver comentário acima sobre cada uma carregar no
  // próprio ritmo). Saúde da loja é o gatilho mais representativo porque
  // alimenta a maioria dos cards, então marca "última atualização" quando
  // ela responde — setado no próprio .then(), não num efeito à parte, pra
  // não disparar um segundo render encadeado à toa.
  const [carregadoEm, setCarregadoEm] = useState<Date | null>(saudeInicial ? new Date() : null);

  const primeiraSaude = useRef(Boolean(saudeInicial));

  useEffect(() => {
    if (primeiraSaude.current) { primeiraSaude.current = false; return; }
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

  const carregandoSaude = saude.chave !== chave;

  /* ── Pós-venda, Recomendações e Publicações (1ª marca) ──
     Esses três buscavam de dentro do próprio card, e o card só montava
     quando o bloco abria — cada clique esperava uma ida ao servidor, e
     fechar e reabrir refazia a busca do zero. Aqui a busca sobe para o
     mosaico, dispara junto com Saúde da loja e Atendimento assim que a
     página carrega, e os cards viram (quase) só apresentação. */
  const [posVenda, setPosVenda] = useState<{ chave: string; dados: PosVendaResultado | null }>(
    posVendaInicial ? { chave: `${hoje}..${hoje}`, dados: posVendaInicial } : { chave: "", dados: null },
  );
  const primeiroPosVenda = useRef(Boolean(posVendaInicial));
  useEffect(() => {
    if (primeiroPosVenda.current) { primeiroPosVenda.current = false; return; }
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

  const [acoes, setAcoes] = useState<{ carregado: boolean; insights: Insight[]; sugestoes: Sugestao[] }>(
    acoesIniciais
      ? { carregado: true, insights: acoesIniciais.insights, sugestoes: acoesIniciais.sugestoes }
      : { carregado: false, insights: [], sugestoes: [] },
  );
  const primeirasAcoes = useRef(Boolean(acoesIniciais));
  useEffect(() => {
    if (primeirasAcoes.current) { primeirasAcoes.current = false; return; }
    let ativo = true;
    Promise.all([actionListarInsights(), actionListarSugestoes()])
      .then(([insights, sugestoes]) => { if (ativo) setAcoes({ carregado: true, insights, sugestoes }); })
      .catch(() => { if (ativo) setAcoes({ carregado: true, insights: [], sugestoes: [] }); });
    return () => { ativo = false; };
  }, []);

  // Publicações usa somente os filtros leves e estáveis que chegam com a
  // página. Não troca de ordem quando Saúde responde e não consulta Product
  // Ads até a pessoa escolher marca e canal dentro do card.
  const marcasPublicacoes = useMemo(() => marcas.map((marca) => ({
      brandId: marca.brandId,
      marca: marca.slug,
      marcaLabel: marca.nome,
    })), [marcas]);

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
    return { ...reclamacoes, itens, total: itens.length, pendentes: itens.filter((item) => item.precisaAcao).length };
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

  // Reclamação só existe pra quem vende pelo Mercado Livre — a API não
  // devolve isso pra Shopee/TikTok Shop. Shopee/TikTok aparecem travados
  // (mesmo padrão de "ainda não disponível" já usado em Publicidade) em vez
  // de sumirem, pra deixar claro que a tela é sobre canais de venda — só que
  // esse canal específico ainda não dá pra filtrar.
  const canaisReclamacoes = useMemo(
    () => canais.map((canal) => (canal.tipo === "mercadolivre" ? canal : { ...canal, conectado: false })),
    [canais],
  );

  const dadosFaturamento = faturamento.dados?.faturamento ?? null;
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
    explicacao: {
      resumo: "Quanto entrou de dinheiro em pedidos válidos no período. É a soma que resta depois de excluir cancelamentos e devoluções.",
      pontos: [
        { titulo: "O que entra na soma", texto: "Todo pedido aprovado dentro do período escolhido, somado pelo valor pago pelo cliente." },
        { titulo: "O que fica de fora", texto: "Pedidos cancelados ou devolvidos não entram nesta soma. Eles são medidos separadamente em Cancelamento." },
        { titulo: "Valor médio por pedido", texto: "É o faturamento dividido pela quantidade de pedidos. O valor sobe quando poucos pedidos caros elevam a média." },
      ],
      dica: "A variação compara o período selecionado com a janela imediatamente anterior, de mesma duração, e não com o mesmo período do ano passado.",
    },
    render: (acaoSlot) => (
      <FaturamentoCard
        dados={dadosFaturamento}
        carregando={faturamento.carregando}
        semFiltro={faturamento.semFiltro}
        cores={coresFaturamento}
        scope={escopo(filtroFaturamento, setFiltroFaturamento)}
        acaoSlot={acaoSlot}
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
    explicacao: {
      resumo: "Uma nota de 0 a 100 que resume a saúde da operação: reputação, pós-venda, satisfação, atendimento e catálogo, numa média ponderada.",
      pontos: [
        { titulo: "Cinco pilares, pesos diferentes", texto: "Reputação e pós-venda pesam mais que catálogo. Um problema de entrega reduz o score mais do que um item sem foto." },
        { titulo: "Pilar sem dado sai da conta", texto: "Se um pilar não tiver informação suficiente no período, o peso será redistribuído entre os demais, em vez de virar zero." },
        { titulo: "Consolidado pesa por faturamento", texto: "Ao visualizar todas as marcas juntas, as que faturam mais influenciam mais o resultado. Não se trata de uma média simples entre marcas." },
      ],
      dica: "Toque em \"Ver a conta\" dentro do anel para ver exatamente quais pilares entraram e com que peso, para o score que está na tela.",
    },
    render: (acaoSlot) => <ScoreCard dados={saude.dados} carregando={carregandoSaude} acaoSlot={acaoSlot} />,
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
    explicacao: {
      resumo: "Coloca as marcas ativas lado a lado e utiliza os mesmos critérios de medição. A liderança muda conforme o critério escolhido nas abas.",
      pontos: [
        { titulo: "Sete critérios, um de cada vez", texto: "Pontuação, Faturamento, Pedidos, Valor médio por pedido, Nota, Cancelamento e Recorrência: a ordenação e a barra seguem o critério ativo." },
        { titulo: "Cor de cada linha é a da marca", texto: "O destaque visual (barra, borda, número) é sempre a identidade da marca, não muda com o critério." },
        { titulo: "Ponto de alerta ao lado do número", texto: "Pontuação, Nota e Cancelamento possuem faixas objetivas. Um ponto colorido indica quando o valor requer atenção." },
        { titulo: "Cumprimento de pedidos", texto: "A barra embaixo de cada marca mostra o que aconteceu com os pedidos do período: entregues, em andamento, cancelados, devolvidos." },
      ],
      dica: "Cancelamento é o único critério em que o menor valor lidera. Por isso, 0% aparece no topo do ranking, e não no fim.",
    },
    render: (acaoSlot) => (
      <ComparacaoCard
        dados={saude.dados}
        carregando={carregandoSaude}
        acaoSlot={acaoSlot}
        atualizadoEm={carregadoEm}
        posVenda={posVenda.dados}
      />
    ),
  }), [saude.dados, carregandoSaude, carregadoEm, posVenda.dados]);

  const blocoReclamacoes = useMemo<BlocoDef>(() => ({
    id: "reclamacoes",
    secao: "atendimento",
    titulo: blocosCopy.reclamacoes.titulo,
    icone: AlertTriangle,
    accent: "var(--destructive)",
    carregando: carregandoReclamacoes,
    semFiltro: semFiltroReclamacoes,
    resumo: {
      // "pendentes" (não "total"): reclamações já resolvidas no Mercado Livre
      // (sem ação nossa restante) não deveriam acender alerta crítico no mosaico.
      valor: reclamacoesVisiveis ? String(reclamacoesVisiveis.pendentes) : null,
      legenda: blocosCopy.reclamacoes.legenda,
      alerta: reclamacoesVisiveis && reclamacoesVisiveis.pendentes > 0
        ? { nivel: "critico", texto: "a resolver" }
        : null,
    },
    explicacao: {
      resumo: "Reclamações que o cliente abriu no Mercado Livre contra um pedido da marca, dentro do período selecionado.",
      pontos: [
        { titulo: "Só Mercado Livre", texto: "Outros canais não têm essa informação disponível pela API, por isso o painel não separa por canal de venda." },
        { titulo: "Mediação é o estágio mais sério", texto: "É quando o próprio Mercado Livre entra na conversa e passa a decidir o caso, em vez de só mediar entre marca e cliente." },
      ],
      dica: "Reclamação aberta não é o mesmo que devolução. Uma reclamação pode ser resolvida sem que o pedido seja cancelado ou devolvido.",
    },
    render: (acaoSlot) => (
      <ReclamacoesCard
        dados={reclamacoesVisiveis}
        carregando={carregandoReclamacoes}
        semFiltro={semFiltroReclamacoes}
        // Canal aparece, mas Shopee/TikTok vêm travados — reclamação só
        // existe pra Mercado Livre, ver canaisReclamacoes acima.
        scope={(
          <ScopeRow
            marcas={marcas}
            canais={canaisReclamacoes}
            filtro={filtroReclamacoes}
            onChange={comSugestao(setFiltroReclamacoes)}
          />
        )}
        acaoSlot={acaoSlot}
      />
    ),
  }), [reclamacoesVisiveis, carregandoReclamacoes, semFiltroReclamacoes, filtroReclamacoes, marcas, canaisReclamacoes, comSugestao]);

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
    explicacao: {
      resumo: "Produtos que entraram na zona de atenção. O saldo ainda está acima do estoque mínimo, mas se aproxima dele, portanto ainda há tempo para repor antes que falte.",
      pontos: [
        { titulo: "Zona de atenção, não de ruptura", texto: "Entra na lista quem possui saldo maior que o mínimo cadastrado, mas limitado a até o dobro desse valor. Quem já atingiu ou ficou abaixo do mínimo saiu desta janela de aviso." },
        { titulo: "Precisa de mínimo cadastrado", texto: "Um produto sem estoque mínimo definido não possui referência para comparação e, por isso, não aparece aqui. Não é falta de dado, mas falta de parâmetro." },
        { titulo: "Urgência considera o ritmo de venda", texto: "Quanto mais perto do mínimo e mais rápido o produto está vendendo no período, maior a urgência de repor." },
        { titulo: "O selo de Status conta o resto da história", texto: "Toque em \"Entenda os status\" dentro do painel para saber o significado de cada status, como Ativo, Pausado e Encerrado. Repor não adianta se o anúncio estiver fora do ar." },
      ],
      dica: "Este painel avisa antes do problema, diferente de Giro baixo e Parados, que mostram o que já não está saindo.",
    },
    render: (acaoSlot) => (
      <ReposicaoCard
        itens={reposicao.dados?.reposicao ?? null}
        carregando={reposicao.carregando}
        semFiltro={reposicao.semFiltro}
        scope={escopo(filtroReposicao, setFiltroReposicao)}
        acaoSlot={acaoSlot}
      />
    ),
  }), [reposicao, filtroReposicao, escopo]);

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
    explicacao: {
      resumo: "Os produtos com mais unidades vendidas no período selecionado. É um ranking de volume de vendas, e não de faturamento.",
      pontos: [
        { titulo: "Ordena por unidades, não por dinheiro", texto: "Um produto barato vendido em volume pode aparecer na frente de um produto caro vendido poucas vezes." },
        { titulo: "O selo de Status conta o resto da história", texto: "Toque em \"Entenda os status\" dentro do painel. Um campeão de vendas com o anúncio pausado ou em revisão é o caso mais urgente, pois as vendas estavam acontecendo e foram interrompidas." },
      ],
      dica: "Combine com 5 produtos mais vendidos, no painel Marca, para ver se a receita depende demais de poucos itens campeões.",
    },
    render: (acaoSlot) => (
      <MaisVendidosCard
        itens={maisVendidos.dados?.maisVendidos ?? null}
        carregando={maisVendidos.carregando}
        semFiltro={maisVendidos.semFiltro}
        scope={escopo(filtroMaisVendidos, setFiltroMaisVendidos)}
        acaoSlot={acaoSlot}
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
    explicacao: {
      resumo: "Produtos com saldo em estoque que quase não venderam no período. Eles ainda vendem, mas em ritmo insuficiente para movimentar o capital imobilizado.",
      pontos: [
        { titulo: "Só quem ainda tem saldo", texto: "Produto com saldo zerado não conta como giro baixo. Quando também não vende há muito tempo, ele pertence à categoria Parados." },
        { titulo: "Limite baixo de propósito", texto: "Entra quem vendeu poucas unidades durante todo o período. O limite é restrito para diferenciar quem vende pouco de quem vende em volume razoável." },
        { titulo: "Ordenado pelo que mais impacta", texto: "Em caso de empate na quantidade vendida, o valor imobilizado em estoque define a ordem. O produto que retém mais dinheiro aparece primeiro." },
        { titulo: "O selo de Status conta o resto da história", texto: "Toque em \"Entenda os status\" dentro do card. Giro baixo com o anúncio pausado ou em revisão pode não ser sobre demanda — pode ser o anúncio fora do ar." },
      ],
      dica: "Vale cruzar com o preço de venda: giro baixo em item caro imobiliza mais capital que giro baixo em item barato, mesmo com a mesma quantidade parada.",
    },
    render: (acaoSlot) => (
      <GiroBaixoCard
        itens={giroBaixo.dados?.giroBaixo ?? null}
        carregando={giroBaixo.carregando}
        semFiltro={giroBaixo.semFiltro}
        scope={escopo(filtroGiroBaixo, setFiltroGiroBaixo)}
        acaoSlot={acaoSlot}
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
    explicacao: {
      resumo: "Produtos com saldo em estoque e sem nenhuma venda registrada nos últimos 90 dias. É capital imobilizado por tempo suficiente para ser considerado um risco.",
      pontos: [
        { titulo: "90 dias é o corte", texto: "Menos que isso é giro baixo (vende pouco); 90 dias ou mais sem nenhuma saída é parado (não vende)." },
        { titulo: "Inclui quem nunca vendeu", texto: "Produtos que nunca tiveram saída também entram aqui, além daqueles que vendiam antes e pararam." },
        { titulo: "Ordenado pelo capital imobilizado", texto: "Quem possui mais dinheiro imobilizado em estoque aparece primeiro, pois é o caso que mais pode justificar uma liquidação." },
        { titulo: "O selo de Status conta o resto da história", texto: "Toque em \"Entenda os status\" dentro do painel para saber o significado de cada status, como Ativo, Pausado e Encerrado." },
      ],
      dica: "Um item nesta lista não é necessariamente ruim. Pode ser um lançamento recente que ainda não teve tempo suficiente para vender. Verifique a data de cadastro antes de decidir pela liquidação.",
    },
    render: (acaoSlot) => (
      <ParadosCard
        itens={parados.dados?.parados ?? null}
        carregando={parados.carregando}
        semFiltro={parados.semFiltro}
        scope={escopo(filtroParados, setFiltroParados)}
        acaoSlot={acaoSlot}
      />
    ),
  }), [parados, filtroParados, escopo]);

  const blocoAcoes = useMemo<BlocoDef>(() => ({
    id: "acoes",
    secao: "marketing",
    titulo: blocosCopy.acoes.titulo,
    icone: Sparkles,
    accent: "var(--acento-1)",
    resumo: { valor: null, legenda: blocosCopy.acoes.legenda },
    explicacao: {
      resumo: "Duas listas diferentes no mesmo painel: observações automáticas sobre a operação e ofertas sugeridas para reativar clientes específicos.",
      pontos: [
        { titulo: "Análises automáticas", texto: "Leituras automáticas dos números do período que destacam mudanças, pontos de atenção ou desvios do padrão, sem exigir a análise individual de cada painel." },
        { titulo: "Sugestões de reativação", texto: "Ofertas geradas para segmentos de clientes (ex.: quem não compra há um tempo), esperando aprovação antes de sair." },
        { titulo: "Nada sai sozinho", texto: "Toda sugestão permanece com o status \"Sugerida\" até ser aprovada ou recusada. O painel nunca envia uma oferta por conta própria." },
      ],
    },
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
      explicacao: {
        resumo: "Como cada anúncio patrocinado se saiu no Mercado Livre durante o período selecionado, sem misturar vendas orgânicas com resultados da publicidade.",
        pontos: [
          { titulo: "Impressões, cliques e vendas atribuídas", texto: "Todos os números vêm da mesma medição de publicidade do Mercado Livre. As vendas orgânicas ficam fora para não distorcer a conversão." },
          { titulo: "Investimento, receita e retorno", texto: "O retorno compara a receita que o Mercado Livre atribuiu ao anúncio com o valor investido exatamente no período selecionado." },
          { titulo: "Pontuação de qualidade", texto: "É a nota atribuída pelo Mercado Livre ao anúncio, considerando ficha técnica, fotos e atributos preenchidos. Essa nota influencia a exibição nas buscas." },
        ],
        dica: "Publicações sem qualquer veiculação ficam separadas para não esconder os anúncios que realmente consumiram verba ou geraram resultado.",
      },
      render: (acaoSlot) => (
        <PublicacoesCard
          marcas={marcasPublicacoes.map((marca) => ({ brandId: marca.brandId, marcaLabel: marca.marcaLabel, slug: marca.marca }))}
          inicio={inicio ?? diasAtras(29)}
          fim={fim ?? hoje}
          acaoSlot={acaoSlot}
        />
      ),
    };
  }, [marcasPublicacoes, inicio, fim]);

  // Junta, separa em seções (Financeiro / Saúde / Atendimento / Estoque /
  // Marketing) e ordena por urgência dentro de cada uma — o trabalho pesado
  // (recriar cada bloco) já aconteceu nos memos acima, isolado por grupo.
  const { grupos, lista: blocos } = useMemo(() => agruparPorSecao([
    blocoFaturamento, blocoScore, blocoReclamacoes, blocoReposicao, blocoComparacao,
    blocoMaisVendidos, blocoGiroBaixo, blocoParados, blocoAcoes,
    ...(blocoPublicacoes ? [blocoPublicacoes] : []),
  ]), [
    blocoFaturamento, blocoScore, blocoReclamacoes, blocoReposicao, blocoComparacao,
    blocoMaisVendidos, blocoGiroBaixo, blocoParados, blocoAcoes,
    blocoPublicacoes,
  ]);

  /* ── Foco ─────────────────────────────────────────────────────── */

  const indiceAberto = blocos.findIndex((bloco) => bloco.id === cardAberto);
  const blocoAberto = indiceAberto >= 0 ? blocos[indiceAberto] : null;

  /* O card aberto vive na URL, mas abrir/fechar é estado local da própria
     tela — não uma navegação. `router.replace` fazia o Next renderizar de
     novo a page.tsx inteira (incluindo as buscas do mosaico) antes de montar
     o painel; por isso o clique parecia morto por alguns segundos. A History
     API é integrada ao useSearchParams no App Router e atualiza a URL sem
     pedir um novo payload ao servidor. */
  const abrir = useCallback((id: string) => {
    window.history.replaceState(null, "", `/metricas?card=${encodeURIComponent(id)}`);
  }, []);

  const fechar = useCallback(() => {
    window.history.replaceState(null, "", "/metricas");
  }, []);

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
        {/* Canto inferior direito em qualquer largura — antes ficava fixo
            no topo (colado sob o cabeçalho) só no mobile, competindo com o
            resto da tela; agora é sempre o mesmo cantinho discreto. */}
        {carregadoEm && (
          <span className="fixed bottom-[calc(4.5rem_+_env(safe-area-inset-bottom))] right-4 z-20 inline-flex items-center gap-1.5 rounded-full bg-card/90 px-3 py-1.5 text-[11px] text-muted-foreground shadow-[0_2px_10px_rgba(14,15,19,.08)] backdrop-blur md:bottom-4">
            <RefreshCw size={11} />
            Atualizado às {dataHora.format(carregadoEm)}
          </span>
        )}

        {/* 5 seções em vez de uma grade só de 14 — cada uma com o próprio
            rótulo e a própria ordenação por urgência (ver agruparPorSecao em
            bloco.tsx). Um bloco com alerta sobe dentro do grupo dele, não
            para cima do mosaico inteiro; o rótulo da seção ganha um ponto na
            cor do pior alerta, então dá pra saber onde olhar antes de abrir
            qualquer coisa. */}
        {/* Telas muito largas (MacBook com janela maximizada, TV) deixavam a
            caixa de 1440px do layout compartilhado sobrando como um vão vazio
            do lado direito, bem visível contra o fundo cinza — as outras
            telas do app (Vendas, Estoque) não sentem isso porque tabelas já
            preenchem bem os 1440px; a grade de cards aqui, não. "Escapa" do
            container pai só a partir de 2xl (~1536px) e recentra numa caixa
            mais larga — mudança isolada do Métricas, o resto do app continua
            travado em 1440px como sempre. */}
        <div className="2xl:relative 2xl:left-1/2 2xl:w-screen 2xl:-translate-x-1/2">
          <div className="2xl:mx-auto 2xl:max-w-[1800px] 2xl:px-[clamp(1rem,2.2vw,2rem)]">
            <div data-coachmark="mosaico-grade" className="flex flex-col gap-3.5 lg:gap-6">
              {grupos.map((grupo) => (
                <section key={grupo.id} className="flex flex-col gap-2">
                  <RotuloSecao label={grupo.label} alerta={grupo.alerta} />
                  {/* Colunas por seção, não uma grade fixa para todas: a seção
                      preenche a linha com os cards que tem, então uma de 3 itens
                      dá cards de 1/3 e a de 4 itens dá cards de 1/4 — em vez de
                      todo mundo herdar a largura da maior e sobrar buraco. O
                      piso de 3 evita o extremo oposto: 2 itens esticados pela
                      metade da tela cada. Uma seção de 1 item só (ex.: Saúde da
                      loja sozinha, depois que Termômetro saiu) não entra nesse
                      piso — um card só forçado a 1/3 da grade deixaria os
                      outros 2/3 vazios, o mesmo buraco que o piso de 3 existe
                      pra evitar. Vira flex, largura do próprio conteúdo. Só
                      afeta lg+; abaixo disso a grade continua a mesma de sempre. */}
                  <ul className={
                    grupo.blocos.length === 1
                      ? "grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:grid-cols-3 lg:flex lg:gap-3"
                      : `grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:grid-cols-3 lg:gap-3 ${COLUNAS_LG[Math.max(3, grupo.blocos.length)] ?? "lg:grid-cols-6"}`
                  }>
                    {grupo.blocos.map((bloco) => (
                      <Bloco key={bloco.id} def={bloco} focado={bloco.id === cardAberto} onAbrir={() => abrir(bloco.id)} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
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
            periodoLabel={saude.dados?.periodoLabel}
            accent={blocoAberto?.accent}
          />
        }
      />
    </>
  );
}
