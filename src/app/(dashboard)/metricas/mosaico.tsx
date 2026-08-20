"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import {
  AlertTriangle, BarChart3, Gauge, Hourglass, Megaphone,
  Package, RefreshCw, ShoppingBag, Sparkles, TrendingDown, TrendingUp,
} from "lucide-react";
import { CalendarioPopoverRange } from "@/shared/design-system/primitives/CalendarioPopoverRange";
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
  actionListarInsights, actionListarSugestoes,
  actionObterDesempenhoPublicacoes, actionObterPosVenda, actionObterSaudeLoja,
} from "./actions";
import { AcoesCard, type Insight, type Sugestao } from "./acoes-card";
import { ComparacaoCard } from "./comparacao-card";
import { PublicacoesCard, type DesempenhoPreCarregado } from "./publicacoes-card";
import { ScoreCard } from "./score-card";
import type { DashboardData } from "@/modules/metricas/application/dashboard.service";
import type { ReclamacoesResultado } from "@/modules/metricas/application/reclamacoes.service";
import type { SaudeLojaResultado } from "@/modules/metricas/application/saude-loja.service";
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

function BarraPeriodo({ periodo, trocarDatas, carregandoSaude, periodoLabel }: {
  periodo: Periodo;
  trocarDatas: (inicio: string, fim: string) => void;
  carregandoSaude: boolean;
  periodoLabel?: string;
}) {
  return (
    <>
      <CalendarioPopoverRange
        rotulo="Período"
        valor={{ inicio: periodo.inicio, fim: periodo.fim }}
        max={hoje}
        onChange={({ inicio, fim }) => trocarDatas(inicio, fim)}
        disabled={carregandoSaude}
      />
      <BotaoHoje
        ativo={periodo.inicio === hoje && periodo.fim === hoje}
        disabled={carregandoSaude}
        onClick={() => {
          const jaEstaEmHoje = periodo.inicio === hoje && periodo.fim === hoje;
          trocarDatas(jaEstaEmHoje ? "" : hoje, jaEstaEmHoje ? "" : hoje);
        }}
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
    description: "Ele cresce e vira o card completo — é lá dentro que ficam De:/Até:/Hoje, e vale para o mosaico inteiro. Esc volta, ← → pulam de card.",
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
  posVendaInicial = null, acoesIniciais = null, publicacoesInicial = null,
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
  publicacoesInicial?: DesempenhoPreCarregado | null;
}) {
  const router = useRouter();
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

  // Só a primeira marca (a aba padrão do card) — trocar de aba com o card já
  // aberto continua buscando na hora, é uma escolha de quem já está olhando.
  const [publicacoes, setPublicacoes] = useState<DesempenhoPreCarregado | null>(publicacoesInicial);
  const primeiraMarcaPublicacoes = saude.dados?.marcas[0]?.brandId ?? null;
  const primeirasPublicacoes = useRef(Boolean(publicacoesInicial));
  useEffect(() => {
    if (primeirasPublicacoes.current) { primeirasPublicacoes.current = false; return; }
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
    explicacao: {
      resumo: "Quanto entrou de dinheiro em pedidos válidos no período, a soma que sobra depois de tirar cancelamentos e devoluções.",
      pontos: [
        { titulo: "O que entra na soma", texto: "Todo pedido aprovado dentro do período escolhido, somado pelo valor pago pelo cliente." },
        { titulo: "O que fica de fora", texto: "Pedidos cancelados ou devolvidos não contam aqui, eles têm o próprio número, em Cancelamento." },
        { titulo: "Ticket médio", texto: "É esse faturamento dividido pela quantidade de pedidos, sobe quando poucos pedidos caros puxam a média." },
      ],
      dica: "A variação já vem calculada contra a janela imediatamente anterior, do mesmo tamanho, não contra o mesmo período do ano passado.",
    },
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
    explicacao: {
      resumo: "Uma nota de 0 a 100 que resume a saúde da operação: reputação, pós-venda, satisfação, atendimento e catálogo, numa média ponderada.",
      pontos: [
        { titulo: "Cinco pilares, pesos diferentes", texto: "Reputação e pós-venda pesam mais que catálogo, um problema de entrega derruba o score mais que um item sem foto." },
        { titulo: "Pilar sem dado sai da conta", texto: "Se um pilar não tem informação suficiente no período, o peso dele é redistribuído entre os demais, não vira zero." },
        { titulo: "Consolidado pesa por faturamento", texto: "Ao ver todas as marcas juntas, quem fatura mais influencia mais o número final, não é uma média simples entre marcas." },
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
      resumo: "Coloca as marcas ativas lado a lado, medidas pelas mesmas réguas, quem lidera muda conforme o critério escolhido nas abas.",
      pontos: [
        { titulo: "Sete critérios, um de cada vez", texto: "Score, Faturamento, Pedidos, Ticket, Nota, Cancelamento e Recorrência: a ordenação e a barra seguem o critério ativo." },
        { titulo: "Cor de cada linha é a da marca", texto: "O destaque visual (barra, borda, número) é sempre a identidade da marca, não muda com o critério." },
        { titulo: "Ponto de alerta ao lado do número", texto: "Score, Nota e Cancelamento têm um \"bom\" e um \"ruim\" objetivos, um pontinho colorido avisa quando o valor pede atenção." },
        { titulo: "Cumprimento de pedidos", texto: "A barra embaixo de cada marca mostra o que aconteceu com os pedidos do período: entregues, em andamento, cancelados, devolvidos." },
      ],
      dica: "Cancelamento é o único critério onde menor vence, 0% aparece no topo do ranking, não no fim.",
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
        { titulo: "Só Mercado Livre", texto: "Outros canais não têm essa informação disponível pela API, por isso o card não separa por canal de venda." },
        { titulo: "Mediação é o estágio mais sério", texto: "É quando o próprio Mercado Livre entra na conversa e passa a decidir o caso, em vez de só mediar entre marca e cliente." },
      ],
      dica: "Reclamação aberta não é o mesmo que devolução, uma reclamação pode ser resolvida sem que o pedido seja cancelado ou devolvido.",
    },
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
    explicacao: {
      resumo: "Produtos que já entraram na zona de atenção (saldo ainda acima do estoque mínimo, mas caminhando pra lá), onde ainda dá tempo de comprar antes de faltar.",
      pontos: [
        { titulo: "Zona de atenção, não de ruptura", texto: "Entra na lista quem tem saldo maior que o mínimo cadastrado, mas já até o dobro dele, quem já cruzou o mínimo saiu dessa janela de aviso." },
        { titulo: "Precisa de mínimo cadastrado", texto: "Produto sem estoque mínimo definido não tem régua pra comparar, então não aparece aqui, não é falta de dado, é falta de referência." },
        { titulo: "Urgência considera o ritmo de venda", texto: "Quanto mais perto do mínimo e mais rápido o produto está vendendo no período, maior a urgência de repor." },
      ],
      dica: "Esse card avisa antes do problema, diferente de Giro baixo e Parados, que mostram o que já não está saindo.",
    },
    render: () => (
      <ReposicaoCard
        itens={reposicao.dados?.reposicao ?? null}
        carregando={reposicao.carregando}
        semFiltro={reposicao.semFiltro}
        scope={escopo(filtroReposicao, setFiltroReposicao)}
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
      resumo: "Os produtos que mais saíram em quantidade dentro do período selecionado, o ranking de venda, não de faturamento.",
      pontos: [
        { titulo: "Ordena por unidades, não por dinheiro", texto: "Um produto barato vendido em volume pode aparecer na frente de um produto caro vendido poucas vezes." },
        { titulo: "Barra de participação", texto: "Cada linha mostra a proporção da quantidade dele contra o líder da lista, não contra o total vendido no período." },
      ],
      dica: "Combine com Top 5 produtos (no card Marca) para ver se a receita da marca depende demais de poucos itens campeões.",
    },
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
    explicacao: {
      resumo: "Produtos com saldo em estoque que quase não venderam no período, vendem, mas devagar demais pra girar o capital parado neles.",
      pontos: [
        { titulo: "Só quem ainda tem saldo", texto: "Produto zerado não conta como giro baixo, esse é o caso de Parados, quando também não vende há muito tempo." },
        { titulo: "Limite baixo de propósito", texto: "Entra quem vendeu poucas unidades no período inteiro, o corte é apertado para não misturar \"vende pouco\" com \"vende razoável\"." },
        { titulo: "Ordenado pelo que dói mais", texto: "Empate em quantidade vendida desempata por valor parado em estoque, o produto que trava mais dinheiro aparece primeiro." },
      ],
      dica: "Vale cruzar com o preço de venda: giro baixo em item caro imobiliza mais capital que giro baixo em item barato, mesmo com a mesma quantidade parada.",
    },
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
    explicacao: {
      resumo: "Produtos com saldo em estoque que não têm nenhuma venda registrada nos últimos 90 dias, capital parado há tempo suficiente pra ser considerado risco.",
      pontos: [
        { titulo: "90 dias é o corte", texto: "Menos que isso é giro baixo (vende pouco); 90 dias ou mais sem nenhuma saída é parado (não vende)." },
        { titulo: "Inclui quem nunca vendeu", texto: "Produto que nunca teve saída também entra aqui, não só quem vendia antes e parou." },
        { titulo: "Ordenado pelo capital imobilizado", texto: "Quem tem mais dinheiro parado em estoque aparece primeiro, é o que mais justifica uma liquidação." },
        // Cada linha explica um status possível do selo "Status:" — não são
        // exemplos do que apareceu na lista agora, é o catálogo completo dos
        // 5 estados, pra quem nunca viu um "Encerrado" ou "Sem vínculo" saber
        // o que significa antes de precisar tocar em um pra descobrir.
        { titulo: "Status: Ativo no ML", texto: "O anúncio está publicado e visível no Mercado Livre — só não vende, não é um problema técnico." },
        { titulo: "Status: Pausado", texto: "Você mesmo pausou o anúncio — ele não vender é esperado, ninguém consegue comprar algo pausado." },
        { titulo: "Status: Encerrado no ML", texto: "O anúncio não existe mais lá, mas o produto continua no catálogo do CRM com saldo — ninguém consegue comprar por nenhum canal." },
        { titulo: "Status: Sem vínculo com o ML", texto: "Não achamos nenhum anúncio deste produto ligado a uma conta do Mercado Livre — o vínculo pode ter se perdido." },
        { titulo: "Status: Indisponível", texto: "Falha temporária ao consultar o Mercado Livre agora — o resto do dado (saldo, dias parado) continua confiável." },
      ],
      dica: "Um item aqui não é necessariamente ruim, pode ser um lançamento recente sem tempo suficiente pra vender. Vale checar a data de cadastro antes de decidir liquidar.",
    },
    render: () => (
      <ParadosCard
        itens={parados.dados?.parados ?? null}
        carregando={parados.carregando}
        semFiltro={parados.semFiltro}
        scope={escopo(filtroParados, setFiltroParados)}
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
      resumo: "Duas listas diferentes no mesmo card: observações automáticas sobre a operação, e ofertas sugeridas para reativar clientes específicos.",
      pontos: [
        { titulo: "Insights", texto: "Leituras automáticas dos números do período, algo que mudou, vale atenção ou foge do padrão, sem precisar caçar isso card por card." },
        { titulo: "Sugestões de reativação", texto: "Ofertas geradas para segmentos de clientes (ex.: quem não compra há um tempo), esperando aprovação antes de sair." },
        { titulo: "Nada sai sozinho", texto: "Toda sugestão fica com status \"sugerida\" até alguém aprovar ou recusar, o card nunca dispara oferta por conta própria." },
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
        resumo: "Como cada anúncio está performando no Mercado Livre: visitas, conversão, vendas e, quando patrocinado, retorno do investimento em publicidade.",
        pontos: [
          { titulo: "Visitas e conversão", texto: "Conversão estimada é a proporção de visitas que viraram venda, um anúncio com muita visita e pouca venda pode ter problema de preço, foto ou descrição." },
          { titulo: "Receita em anúncios e ROI", texto: "Só aparece pra quem tem Product Ads ativo, mostra quanto foi investido em publicidade e quanto voltou em vendas." },
          { titulo: "Pontuação de qualidade", texto: "Nota do próprio Mercado Livre sobre o anúncio (ficha técnica, fotos, atributos preenchidos), afeta o quanto ele aparece nas buscas." },
        ],
        dica: "Um anúncio com boa pontuação de qualidade mas conversão baixa costuma ser problema de preço ou concorrência, não de cadastro.",
      },
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
            periodoLabel={saude.dados?.periodoLabel}
          />
        }
      />
    </>
  );
}
