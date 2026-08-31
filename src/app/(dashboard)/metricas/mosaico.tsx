"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  BarChart3, Gauge, Hourglass, Megaphone,
  Package, ShoppingBag, TrendingDown, TrendingUp,
} from "lucide-react";
import { CoachMarks, type CoachMarkStep } from "@/shared/design-system/primitives/CoachMarks";
import { stagger } from "@/shared/design-system/motion-variants";
import { escopoIncompleto, getBrandConfig, isBrandSlug } from "@/shared/config/brands";
import { channelAccent } from "@/shared/design-system/primitives/ChannelLogo";
import metricasConfig from "@/config/metricas.json";

import { agruparPorSecao, Bloco, Foco, type BlocoDef } from "./bloco";
import { ScopeRow, type CardFiltro, type ScopeCanal, type ScopeMarca } from "./painel/scope-row";
import { type Periodo, AnelScore } from "./metricas-primitives";
import { CalendarioPopoverRange } from "@/shared/design-system/primitives/CalendarioPopoverRange";
import { BotaoHoje } from "@/shared/design-system/primitives/BotaoHoje";
import { BarrasTendencia, BarrasMarca, MiniRanking } from "./mini-visuais";
import { actionObterDashboardData } from "./painel/actions";
import { actionObterFiltrosPedidos } from "../vendas/actions";
import {
  actionObterLimiteDoDia, actionObterPosVenda, actionObterResumoPublicacoes, actionObterSaudeLoja,
  actionObterSnapshotAnterior, type ResumoPublicacoesMosaico,
} from "./actions";
import { PLATAFORMAS_ANUNCIOS, type PlataformaAnuncios } from "@/modules/anuncios/domain/plataformas";
import type { LimiteDoDia } from "@/shared/components/limite-do-dia";
import type { SnapshotMetricas } from "@/modules/metricas/application/snapshot-metricas.service";
import type { DashboardData } from "@/modules/metricas/application/dashboard.service";
import type { SaudeLojaResultado } from "@/modules/metricas/application/saude-loja.service";
import type { PosVendaResultado } from "@/modules/metricas/application/pos-venda.service";
import { useAtualizacaoLocal } from "@/shared/lib/atualizacao-local";
import { ESCOPO_SNAPSHOT_METRICAS } from "@/modules/metricas/domain/snapshot-scope";
import { calcularVantagemPercentualDaLider } from "@/modules/metricas/domain/comparacao-marcas";

const copy = metricasConfig.mosaico;
const blocosCopy = copy.blocos;

function PainelCarregando() {
  return <div className="shimmer h-52 w-full rounded-[1.25rem] bg-muted" role="status" aria-label="Carregando painel" />;
}


const FaturamentoCard = dynamic(() => import("./painel/faturamento-card").then((modulo) => modulo.FaturamentoCard), { loading: PainelCarregando });
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
  return escopoIncompleto(filtro.brandId, filtro.canal);
}

/** Cópia local da mesma conta de `snapshot-metricas.service.ts` — não dá
 *  pra importar a função de lá aqui: aquele arquivo puxa Drizzle/Postgres
 *  no topo, e isto aqui é "use client". Null quando não há base de
 *  comparação (snapshot ausente ou zero), nunca um percentual inventado. */
/** "R$ 6,3k" — compacto de propósito pro número caber no card sem
 *  quebrar linha; não precisa dos centavos exatos aqui. */
function formatarReaisCompacto(valor: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1,
  }).format(valor);
}

function calcularVariacao(atual: number, anterior: number | null): number | null {
  if (anterior === null || anterior === 0) return null;
  return Math.round(((atual - anterior) / anterior) * 100);
}

/** As grades mobile e desktop ficam as DUAS sempre montadas (só CSS —
 *  `lg:hidden`/`hidden lg:flex` — troca qual aparece; o React nunca
 *  desmonta a outra). Sem saber qual é a de verdade, cada card teria duas
 *  cópias reivindicando o mesmo `layoutId` compartilhado com o Foco ao
 *  mesmo tempo — e o Framer podia animar de volta pra cópia invisível ao
 *  fechar, deixando o card visível vazio (achado real, só no mobile). Este
 *  hook diz qual árvore é a ativa de verdade, pelo breakpoint real da
 *  tela — mesmo valor que o `lg:` do Tailwind usa (1024px) — pra só ela
 *  receber o `layoutId` de verdade (ver `ativoLayout` em `Bloco`). */
function useEhDesktop() {
  const [ehDesktop, setEhDesktop] = useState(false);
  useEffect(() => {
    const consulta = window.matchMedia("(min-width: 1024px)");
    const atualizar = () => setEhDesktop(consulta.matches);
    atualizar();
    consulta.addEventListener("change", atualizar);
    return () => consulta.removeEventListener("change", atualizar);
  }, []);
  return ehDesktop;
}

function useDadosDoCard(
  cache: React.MutableRefObject<Map<string, Promise<DashboardData>>>,
  periodo: Periodo,
  filtro: CardFiltro,
  versaoDashboard: number,
  inicial: { chave: string; dados: DashboardData } | null = null,
) {
  const periodoBusca = periodoEfetivo(periodo);
  const chave = `${chaveFiltro(periodoBusca, filtro)}|v${versaoDashboard}`;
  const semFiltro = semFiltroDefinido(filtro);
  const [resultado, setResultado] = useState<{ chave: string; dados: DashboardData | null }>(() =>
    inicial?.chave === chave ? inicial : { chave: "", dados: null },
  );

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
   Renderizada duas vezes: no topo do mosaico (sempre visível, valendo pra
   todos os previews) e dentro do Foco (porque o painel de foco cobre a
   tela inteira quando um card abre, e trocar o período ali dentro não
   pode exigir fechar primeiro). As duas instâncias leem e escrevem o
   mesmo estado (props vindas de `Mosaico`), então nunca desincronizam.
   Exportar em PDF saiu por completo (o botão exportava sempre o mesmo
   resumo Score+Atendimento+Pós-venda, sem relação com o card em foco —
   decisão tomada com o usuário). Em 28/08/2026 o PDF saiu do produto
   inteiro, não só daqui. */
function BarraPeriodo({ periodo, trocarDatas, periodoLabel, accent, semHoje }: {
  periodo: Periodo;
  trocarDatas: (inicio: string, fim: string) => void;
  periodoLabel?: string;
  /** Acento do card em foco — o calendário e o "Hoje" pintam com a mesma
   *  cor do ícone do card, em vez de um teal genérico igual para todos. */
  accent?: string;
  /** Some com o botão "Hoje" avulso — o popover de Período já tem o mesmo
   *  atalho lá dentro (ver CalendarioPopoverRange), então é redundante.
   *  Hoje só o card Marca/Comparação usa isto: ali o espaço economizado
   *  vira lugar pro filtro de canal, que entrou na mesma linha. */
  semHoje?: boolean;
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
      {!semHoje && (
        <BotaoHoje
          ativo={periodo.inicio === hoje && periodo.fim === hoje}
          onClick={() => {
            const jaEstaEmHoje = periodo.inicio === hoje && periodo.fim === hoje;
            trocarDatas(jaEstaEmHoje ? "" : hoje, jaEstaEmHoje ? "" : hoje);
          }}
          className="hidden sm:inline-flex"
          accent={accent}
        />
      )}
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

/* ── Mosaico ───────────────────────────────────────────────────── */

export function Mosaico({
  marcasIniciais = [], canaisIniciais = [], saudeInicial = null,
  posVendaInicial = null, posVendaInicialChave = null, snapshotInicial,
  dashboardInicial = null, dashboardInicialChave = null,
}: {
  /* O mosaico é a soma de seis buscas independentes, todas resolvidas no
     servidor e entregues dentro do HTML (ver page.tsx). */
  marcasIniciais?: ScopeMarca[];
  canaisIniciais?: ScopeCanal[];
  saudeInicial?: SaudeLojaResultado | null;
  posVendaInicial?: PosVendaResultado | null;
  /** Escopo exato que o servidor usou para buscar `posVendaInicial`, no mesmo
   *  formato de `chave` ("inicio..fim|canais"). Sem ele o cliente teria de
   *  adivinhar — e adivinhava errado (ver o estado de pós-venda abaixo). */
  posVendaInicialChave?: string | null;
  snapshotInicial?: SnapshotMetricas | null;
  dashboardInicial?: DashboardData | null;
  dashboardInicialChave?: string | null;
}) {
  const params = useSearchParams();
  const cardAberto = params.get("card");
  const ehDesktop = useEhDesktop();

  const [periodo, setPeriodo] = useState<Periodo>({ inicio: hoje, fim: hoje });
  const [marcas, setMarcas] = useState<ScopeMarca[]>(marcasIniciais);
  const [canais, setCanais] = useState<ScopeCanal[]>(canaisIniciais);
  const cache = useRef(new Map<string, Promise<DashboardData>>(
    dashboardInicial && dashboardInicialChave
      ? [[dashboardInicialChave, Promise.resolve(dashboardInicial)]]
      : [],
  ));
  const dashboardPrecarregado = dashboardInicial && dashboardInicialChave
    ? { chave: dashboardInicialChave, dados: dashboardInicial }
    : null;
  /* ── Invalidação por fonte ────────────────────────────────────────
     Antes havia um contador só: qualquer mudança — um pedido novo que fosse
     — limpava o cache inteiro e refazia os cinco cartões, Saúde, Pós-venda e
     o snapshot de ontem. Agora cada bloco escuta a origem de que realmente
     depende.

     Os cinco cartões continuam com um contador comum de propósito: os cinco
     saem do MESMO payload (uma chamada de dashboard por filtro), então dar
     contadores diferentes a eles só faria a mesma resposta ser buscada duas
     vezes. O que muda é o gatilho — pedidos e estoque, não avaliação nem
     reputação. */
  const [versaoDashboard, setVersaoDashboard] = useState(0);
  const [versaoSaude, setVersaoSaude] = useState(0);
  const [versaoPosVenda, setVersaoPosVenda] = useState(0);

  useAtualizacaoLocal("metricas", useCallback(() => {
    cache.current.clear();
    setVersaoDashboard((atual) => atual + 1);
  }, []), { fontes: ["pedidos", "estoque"] });

  useAtualizacaoLocal("metricas", useCallback(() => {
    setVersaoSaude((atual) => atual + 1);
  }, []), { fontes: ["reputacao", "avaliacoes"] });

  useAtualizacaoLocal("metricas", useCallback(() => {
    setVersaoPosVenda((atual) => atual + 1);
  }, []), { fontes: ["avaliacoes"] });

  /* Um único filtro pra tela toda — antes era um por card (pra comparar
     marcas diferentes lado a lado); a barra de escopo agora vale pra todos
     os previews ao mesmo tempo, igual ao resto do app (Vendas, Estoque,
     Avaliações). Quem quiser comparar marcas diferentes faz isso dentro de
     Marca/Comparação, que já existem pra esse fim. Começa com tudo
     selecionado (todas as marcas conectadas + todos os canais conectados) —
     a régua "sem filtro = sem dado" continua valendo se a pessoa limpar a
     seleção, mas o primeiro carregamento já mostra número, não uma tela
     pedindo escolha.

     Até 28/08/2026 "tudo" era só o Mercado Livre, porque era o único canal
     com dado; a Shopee ficava de fora do primeiro carregamento e sumia da
     tela inteira (inclusive do card Publicações) sem nada explicando. */
  const [filtroGlobal, setFiltroGlobal] = useState<CardFiltro>(() => ({
    brandId: marcasIniciais.map((marca) => marca.brandId),
    canal: canaisIniciais.filter((canal) => canal.conectado).map((canal) => canal.tipo),
  }));

  // Quando as marcas/canais chegam depois do primeiro render (montagem sem
  // dado inicial do servidor — ver `primeirasContagens` mais abaixo), o
  // filtro nasceu vazio porque `marcasIniciais`/`canaisIniciais` também
  // vieram vazios. Preenche uma única vez, só se a pessoa ainda não mexeu
  // em nada — depois disso a escolha dela manda.
  const primeiroFiltroAplicado = useRef(marcasIniciais.length > 0);
  useEffect(() => {
    if (primeiroFiltroAplicado.current || marcas.length === 0) return;
    primeiroFiltroAplicado.current = true;
    setFiltroGlobal({
      brandId: marcas.map((marca) => marca.brandId),
      canal: canais.filter((canal) => canal.conectado).map((canal) => canal.tipo),
    });
  }, [marcas, canais]);

/* Falta empresa ou falta canal: o mosaico inteiro para. Cada card já respeita
     isso por dentro (ver `semFiltroDefinido`), mas Saúde da loja — que
     alimenta Score e Comparação — buscava por fora dessa régua. */
  const faltaEscopo = escopoIncompleto(filtroGlobal.brandId, filtroGlobal.canal);

  const faturamento = useDadosDoCard(cache, periodo, filtroGlobal, versaoDashboard, dashboardPrecarregado);
  const reposicao = useDadosDoCard(cache, periodo, filtroGlobal, versaoDashboard, dashboardPrecarregado);
  const maisVendidos = useDadosDoCard(cache, periodo, filtroGlobal, versaoDashboard, dashboardPrecarregado);
  const giroBaixo = useDadosDoCard(cache, periodo, filtroGlobal, versaoDashboard, dashboardPrecarregado);
  const parados = useDadosDoCard(cache, periodo, filtroGlobal, versaoDashboard, dashboardPrecarregado);

  // Estas duas já vieram prontas do servidor quando há dado inicial — refazê-las
  // aqui só repetiria no navegador o que acabou de chegar no HTML.
  const primeirasContagens = useRef(marcasIniciais.length > 0 || canaisIniciais.length > 0);

  useEffect(() => {
    if (primeirasContagens.current) { primeirasContagens.current = false; return; }
    actionObterFiltrosPedidos()
      .then((resultado) => { setMarcas(resultado.marcas); setCanais(resultado.canais); })
      .catch(() => { setMarcas([]); setCanais([]); });
  }, []);

  /* ── Saúde da loja ── */

  const completo = Boolean(periodo.inicio && periodo.fim);
  const inicio = completo ? periodo.inicio : undefined;
  const fim = completo ? periodo.fim : undefined;
  // O canal entra na chave junto com o período. Antes ficava de fora, e o
  // resultado é que clicar numa bandeirinha não refazia nem marcava como
  // desatualizada nenhuma das duas buscas deste bloco — o filtro de canal era
  // decorativo neste card. Ordenado para "ML, Shopee" e "Shopee, ML" serem a
  // mesma chave, igual ao `chaveFiltro` dos cinco cartões.
  const canaisEscolhidos = useMemo(() => [...filtroGlobal.canal].sort(), [filtroGlobal.canal]);
  const brandIdsEscolhidos = useMemo(() => [...filtroGlobal.brandId].sort(), [filtroGlobal.brandId]);
  const chave = `${inicio ?? ""}..${fim ?? ""}|${brandIdsEscolhidos.join(",")}|${canaisEscolhidos.join(",")}`;

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
  const primeiraSaude = useRef(Boolean(saudeInicial));

  useEffect(() => {
    if (primeiraSaude.current) { primeiraSaude.current = false; return; }
    if (faltaEscopo) return;
    let ativo = true;
    actionObterSaudeLoja({ inicio, fim, brandIds: brandIdsEscolhidos, canais: canaisEscolhidos })
      .then((resultado) => { if (ativo) setSaude({ chave, dados: resultado }); })
      .catch(() => {
        if (!ativo) return;
        setSaude({ chave, dados: null });
        toast.error(metricasConfig.erros.carregar, { id: "metricas-saude" });
      });
    return () => { ativo = false; };
  }, [chave, inicio, fim, brandIdsEscolhidos, canaisEscolhidos, versaoSaude, faltaEscopo]);

  const carregandoSaude = !faltaEscopo && saude.chave !== chave;
  const dadosSaude = faltaEscopo ? null : saude.dados;

  /* ── Pós-venda, Recomendações e Publicações (1ª marca) ──
     Esses três buscavam de dentro do próprio card, e o card só montava
     quando o bloco abria — cada clique esperava uma ida ao servidor, e
     fechar e reabrir refazia a busca do zero. Aqui a busca sobe para o
     mosaico, dispara junto com Saúde da loja e Atendimento assim que a
     página carrega, e os cards viram (quase) só apresentação. */
  /* A chave do pré-carregado vem do servidor (ver page.tsx) em vez de ser
     assumida aqui. Antes o estado nascia rotulado como `hoje..hoje`, mas o
     servidor tinha buscado a janela padrão de 30 dias — e como o efeito
     abaixo pulava a primeira execução, "Cumprimento de pedidos" mostrava 30
     dias enquanto o resto do mesmo card mostrava o período escolhido. Com a
     chave real, qualquer divergência (fuso do navegador diferente, canal
     padrão diferente) vira uma rebusca em vez de um número errado. */
  const [posVenda, setPosVenda] = useState<{ chave: string; dados: PosVendaResultado | null }>(
    posVendaInicial ? { chave: posVendaInicialChave ?? "", dados: posVendaInicial } : { chave: "", dados: null },
  );
  // Guarda a última chave PEDIDA (não a última respondida): é o que impede
  // tanto a rebusca à toa quando o pré-carregado já serve quanto o número
  // velho ficar na tela quando não serve.
  const chavePosVendaPedida = useRef<string | null>(
    posVendaInicial ? `${posVendaInicialChave ?? ""}|v0` : null,
  );
  useEffect(() => {
    const alvo = `${chave}|v${versaoPosVenda}`;
    if (chavePosVendaPedida.current === alvo) return;
    chavePosVendaPedida.current = alvo;
    let ativo = true;
    actionObterPosVenda({ inicio, fim, brandIds: brandIdsEscolhidos, canais: canaisEscolhidos })
      .then((dados) => { if (ativo) setPosVenda({ chave, dados }); })
      .catch(() => {
        if (!ativo) return;
        setPosVenda({ chave, dados: null });
        toast.error(metricasConfig.erros.carregar, { id: "metricas-posvenda" });
      });
    return () => { ativo = false; };
  }, [chave, inicio, fim, brandIdsEscolhidos, canaisEscolhidos, versaoPosVenda]);

  // Pós-venda fora do período/canal atuais é dado velho: o card recebe null e
  // mostra o vazio dele, em vez de exibir a janela anterior como se fosse esta.
  const posVendaAtual = posVenda.chave === chave ? posVenda.dados : null;

  /* ── Pedidos na virada do dia do Mercado Livre ────────────────────────
     A ressalva de fuso que a faixa do card de Faturamento mostra. Segue a
     MESMA chave dos outros cards (período + marcas + canais), porque a
     pergunta é sobre o número que está na tela — mudou o recorte, muda o
     que fica na fronteira.

     Falha em silêncio: é um complemento do número, não o número. Um toast
     aqui acusaria erro de carregamento de uma tela que carregou. */
  const [limite, setLimite] = useState<{ chave: string; dados: LimiteDoDia | null }>({ chave: "", dados: null });
  const chaveLimitePedida = useRef<string | null>(null);
  useEffect(() => {
    const alvo = `${chave}|v${versaoDashboard}`;
    if (chaveLimitePedida.current === alvo) return;
    chaveLimitePedida.current = alvo;
    let ativo = true;
    actionObterLimiteDoDia({ inicio, fim, brandIds: brandIdsEscolhidos, canais: canaisEscolhidos })
      .then((dados) => { if (ativo) setLimite({ chave, dados }); })
      .catch(() => { if (ativo) setLimite({ chave, dados: null }); });
    return () => { ativo = false; };
  }, [chave, inicio, fim, brandIdsEscolhidos, canaisEscolhidos, versaoDashboard]);

  const limiteAtual = limite.chave === chave ? limite.dados : null;

  /* ── Snapshot de ontem, pra comparação real ──────────────────────────
     Giro baixo, Parados, Repor em breve e Pontuação da loja não tinham
     como calcular variação: saldo de estoque é sobrescrito a cada
     sincronização, e o score da loja nunca era persistido — o dado de
     comparação simplesmente não existia no banco (ver job A30, que passou
     a gravar 1 foto por dia a partir de hoje). Busca uma vez, não depende
     de filtro nem de período — é sempre "ontem vs. hoje". */
  const [snapshotOntem, setSnapshotOntem] = useState<SnapshotMetricas | null>(snapshotInicial ?? null);
  const primeiroSnapshot = useRef(snapshotInicial !== undefined);
  useEffect(() => {
    if (primeiroSnapshot.current) { primeiroSnapshot.current = false; return; }
    let ativo = true;
    actionObterSnapshotAnterior(1)
      .then((snapshot) => { if (ativo) setSnapshotOntem(snapshot); })
      .catch(() => { if (ativo) setSnapshotOntem(null); });
    return () => { ativo = false; };
  }, [versaoDashboard]);

  /** Snapshot só é comparável quando reproduzimos exatamente sua régua.
   * Linhas antigas são `legado`; filtros diferentes ocultam a variação em
   * vez de comparar números de universos distintos. */
  const todasAsMarcasSelecionadas = filtroGlobal.brandId.length === 0
    || (filtroGlobal.brandId.length === marcas.length
      && marcas.every((marca) => filtroGlobal.brandId.includes(marca.brandId)));
  const apenasMercadoLivre = filtroGlobal.canal.length === 1 && filtroGlobal.canal[0] === "mercadolivre";
  const periodoDiarioAtual = periodo.inicio === hoje && periodo.fim === hoje;
  const snapshotComparavel = snapshotOntem?.escopoCalculo === ESCOPO_SNAPSHOT_METRICAS
    && todasAsMarcasSelecionadas && apenasMercadoLivre && periodoDiarioAtual
    ? snapshotOntem
    : null;

  // Publicações usa somente os filtros leves e estáveis que chegam com a
  // página. Não troca de ordem quando Saúde responde e não consulta Product
  // Ads até a pessoa escolher marca e canal dentro do card.
  const marcasPublicacoes = useMemo(() => marcas.map((marca) => ({
      brandId: marca.brandId,
      marca: marca.slug,
      marcaLabel: marca.nome,
    })), [marcas]);

  const idsPublicacoes = useMemo(() => {
    const selecionadas = filtroGlobal.brandId.length > 0
      ? filtroGlobal.brandId
      : marcasPublicacoes.map((marca) => marca.brandId);
    return [...selecionadas].sort();
  }, [filtroGlobal.brandId, marcasPublicacoes]);
  /* Quais canais de publicidade o filtro global deixa passar. Antes isto era
     um booleano "é Mercado Livre?", porque só o ML tinha Product Ads
     integrado; com a Shopee sincronizando (job A32), filtrar por Shopee
     esvaziava o card em vez de mostrar os anúncios dela. Sem filtro de canal
     = todos os canais com publicidade, e um canal sem publicidade (TikTok)
     simplesmente não entra na lista. */
  const canaisPublicacoes = useMemo<PlataformaAnuncios[]>(() => {
    // Empresa marcada sem canal marcado não vira "todas as plataformas":
    // é escopo incompleto, e o card espera a escolha (ver
    // `escopoIncompleto`).
    if (escopoIncompleto(filtroGlobal.brandId, filtroGlobal.canal)) return [];
    return filtroGlobal.canal.length === 0
      ? [...PLATAFORMAS_ANUNCIOS]
      : PLATAFORMAS_ANUNCIOS.filter((canal) => filtroGlobal.canal.includes(canal));
  }, [filtroGlobal.brandId, filtroGlobal.canal]);
  const publicacoesNoEscopo = canaisPublicacoes.length > 0;
  const periodoPublicacoes = periodoEfetivo(periodo);
  const chavePublicacoes = `${periodoPublicacoes.inicio}..${periodoPublicacoes.fim}|${idsPublicacoes.join(",")}|${canaisPublicacoes.join(",")}`;
  const [resumoPublicacoes, setResumoPublicacoes] = useState<{
    chave: string;
    dados: ResumoPublicacoesMosaico | null;
    falhou: boolean;
  }>({ chave: "", dados: null, falhou: false });

  useEffect(() => {
    if (!publicacoesNoEscopo || idsPublicacoes.length === 0) return;
    let ativo = true;
    actionObterResumoPublicacoes({
      brandIds: idsPublicacoes,
      canais: canaisPublicacoes,
      inicio: periodoPublicacoes.inicio,
      fim: periodoPublicacoes.fim,
    })
      .then((dados) => { if (ativo) setResumoPublicacoes({ chave: chavePublicacoes, dados, falhou: false }); })
      .catch(() => {
        if (!ativo) return;
        setResumoPublicacoes({ chave: chavePublicacoes, dados: null, falhou: true });
        toast.error("Não foi possível carregar o resumo de Publicações.", { id: "metricas-publicacoes-resumo" });
      });
    return () => { ativo = false; };
  }, [chavePublicacoes, idsPublicacoes, canaisPublicacoes, periodoPublicacoes.inicio, periodoPublicacoes.fim, publicacoesNoEscopo]);

  const resumoPublicacoesAtual = resumoPublicacoes.chave === chavePublicacoes ? resumoPublicacoes.dados : null;
  const carregandoPublicacoes = publicacoesNoEscopo && idsPublicacoes.length > 0
    && resumoPublicacoes.chave !== chavePublicacoes;

  /* ── Cores do pico do gráfico de Faturamento ──
     Segue o que está filtrado: marca escolhida manda; sem marca mas com
     canal, usa a cor do canal; sem nada, o gradiente genérico. */
  const coresFaturamento = useMemo(() => {
    const porMarca = marcas
      .filter((item) => filtroGlobal.brandId.includes(item.brandId))
      .map((item) => (isBrandSlug(item.slug) ? getBrandConfig(item.slug)?.color : undefined))
      .filter((cor): cor is string => Boolean(cor));
    return porMarca.length > 0 ? porMarca : filtroGlobal.canal.map((tipo) => channelAccent(tipo));
  }, [marcas, filtroGlobal.brandId, filtroGlobal.canal]);

  const trocarDatas = useCallback((novoInicio: string, novoFim: string) => {
    setPeriodo({ inicio: novoInicio, fim: novoFim });
  }, []);

  // Sobe pro mosaico porque o título do card (no cabeçalho do Foco, fora do
  // FaturamentoCard) também precisa saber se a visão é bruta ou líquida.
  const [visaoLiquida, setVisaoLiquida] = useState(false);

  /* ── Blocos ───────────────────────────────────────────────────────
     Um bloco (ou grupo de blocos vizinhos) por memo, cada um com a própria
     lista de dependências — pequena o bastante para o linter conferir
     sozinha, sem eslint-disable. Antes disso os 14 blocos viviam num único
     useMemo com ~25 dependências escritas à mão: qualquer clique de filtro
     reprocessava a lista inteira, e uma dependência esquecida ali vira bug
     silencioso (closure presa em dado antigo) que o linter não pega. */

  // Um único ScopeRow, reaproveitado dentro de cada card aberto — antes
  // cada card tinha o próprio filtro (e o próprio ScopeRow); agora todos
  // leem e escrevem o mesmo `filtroGlobal`, então mudar a marca dentro de
  // um card aberto também muda o que os outros tiles mostram fechados.
  const escopo = useMemo(() => (
    <ScopeRow marcas={marcas} canais={canais} filtro={filtroGlobal} onChange={setFiltroGlobal} />
  ), [marcas, canais, filtroGlobal]);

  // Chip de marca no rodapé do tile — o filtro global, pra bater com o que
  // a barra de escopo no topo está mostrando.
  const chipsDoFiltro = useMemo(() =>
    marcas.filter((marca) => filtroGlobal.brandId.includes(marca.brandId)).map((marca) => ({ slug: marca.slug, label: marca.nome })),
  [marcas, filtroGlobal.brandId]);

  /* O escopo que o "Ver todos no Estoque" leva junto.
   *
   *  Antes o link saía só com `?filtro=`, e recorte sozinho não abre lista
   *  nenhuma lá: o Estoque exige empresa escolhida antes de mostrar produto.
   *  Quem clica aqui já tem empresa e canal marcados — o card nem desenha
   *  lista sem isso —, então o link carrega os dois e a pessoa reencontra a
   *  mesma lista que estava olhando, completa. Marca vai por slug: link
   *  legível, sem identificador interno espalhado. */
  const escopoDoLinkEstoque = useMemo(() => ({
    marcas: marcas
      .filter((marca) => filtroGlobal.brandId.includes(marca.brandId))
      .map((marca) => marca.slug),
    canais: canaisEscolhidos,
  }), [marcas, filtroGlobal.brandId, canaisEscolhidos]);

  const dadosFaturamento = faturamento.dados?.faturamento ?? null;
  const blocoFaturamento = useMemo<BlocoDef>(() => ({
    id: "faturamento",
    secao: "financeiro",
    titulo: visaoLiquida ? "Faturamento líquido" : blocosCopy.faturamento.titulo,
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
      resumo: visaoLiquida
        ? "Faturamento líquido: o valor bruto menos a taxa do canal de venda (por item, quando o canal informa) e o frete pago pelo vendedor. Não desconta desconto/acréscimo do pedido, custo do produto nem imposto."
        : "Faturamento bruto: quanto entrou de dinheiro em pedidos válidos no período, sem descontar taxa do canal, frete, custo do produto ou imposto. É a soma que resta depois de excluir cancelamentos e devoluções.",
      pontos: [
        { titulo: "O que entra na soma", texto: "Todo pedido aprovado dentro do período escolhido, somado pelo valor pago pelo cliente." },
        { titulo: "O que fica de fora", texto: "Pedidos cancelados ou devolvidos não entram nesta soma. Eles são medidos separadamente em Cancelamento." },
        { titulo: "Valor médio por pedido", texto: "É o faturamento dividido pela quantidade de pedidos. O valor sobe quando poucos pedidos caros elevam a média." },
      ],
      dica: "A variação compara o período selecionado com a janela imediatamente anterior, de mesma duração, e não com o mesmo período do ano passado.",
    },
    /* Gráfico da série, grande — barras a partir do zero, que é o que o
       card do topo tem de mais característico pra mostrar. Já foi flecha
       de ícone, linha fina, colunas e zigue-zague com ponta: todas
       degeneravam no período curto. A causa nunca foi o tipo de gráfico —
       era a matemática das colunas (teto de largura + altura normalizada
       pelo mínimo, ver BarrasTendencia). Corrigido isso, barra é o desenho
       que preenche a caixa em qualquer tamanho de série.
       O fallback abaixo garante os 2 pontos na origem: sem série, desenha
       [anterior, atual] — o mesmo par que já alimenta o "+9%" ao lado do
       número —, então o gráfico nunca fica vazio nem mente.
       Verde subindo / vermelho descendo / cinza estável, mesma leitura
       semântica do Delta. */
    preview: dadosFaturamento
      ? (() => {
          const pontos = dadosFaturamento.serie.length > 1
            ? dadosFaturamento.serie.map((ponto) => ponto.valor)
            : [dadosFaturamento.totalAnteriorNumerico, dadosFaturamento.totalNumerico];
          const variacaoTraco = dadosFaturamento.variacaoPercentual;
          const cor = variacaoTraco === null || Math.abs(variacaoTraco) < 0.5
            ? "var(--muted-foreground)"
            : variacaoTraco < 0 ? "var(--destructive)" : "var(--success)";
          // Duas instâncias, mesmo padrão do Anel de Score/Publicações: o
          // SVG tem largura FIXA em pixels (não responsiva), então os
          // mesmos 180×60 que cabem folgados no card em destaque (linha
          // inteira, telas largas) ficavam espremidos no card mobile
          // (metade da largura da tela, "grande" empilha número em cima
          // do gráfico em vez de lado a lado) — cortados pelo
          // `overflow-hidden` do card. Menor no mobile em vez de cortado.
          return (
            <>
              <span className="lg:hidden"><BarrasTendencia dados={pontos} cor={cor} largura={104} altura={42} /></span>
              <span className="hidden lg:block"><BarrasTendencia dados={pontos} cor={cor} largura={180} altura={60} /></span>
            </>
          );
        })()
      : undefined,
    chips: chipsDoFiltro,
    render: (acaoSlot) => (
      <FaturamentoCard
        dados={dadosFaturamento}
        carregando={faturamento.carregando}
        semFiltro={faturamento.semFiltro}
        cores={coresFaturamento}
        scope={escopo}
        acaoSlot={acaoSlot}
        liquido={visaoLiquida}
        aoTrocarLiquido={setVisaoLiquida}
        limiteDoDia={limiteAtual}
      />
    ),
  }), [dadosFaturamento, faturamento.carregando, faturamento.semFiltro, coresFaturamento, escopo, chipsDoFiltro, visaoLiquida, limiteAtual]);

  const blocoScore = useMemo<BlocoDef>(() => ({
    id: "score",
    secao: "saude",
    titulo: blocosCopy.score.titulo,
    icone: Gauge,
    // Enquanto não há dado, cai na mesma cor fixa que score-card.tsx usa no
    // próprio cabeçalho (ACENTO) — antes esse fallback divergia da cor real
    // do card. Com dado, o score manda: a cor representa a saúde atual, não
    // uma identidade fixa.
    accent: dadosSaude?.faixaGeralCor ?? "var(--acento-2)",
    carregando: carregandoSaude,
    semFiltro: faltaEscopo,
    resumo: {
      valor: dadosSaude?.scoreGeral !== null && dadosSaude?.scoreGeral !== undefined
        ? String(Math.round(dadosSaude.scoreGeral))
        : null,
      legenda: dadosSaude?.faixaGeralLabel ?? blocosCopy.score.legenda,
      // Variação real contra a foto de ontem (job A30) quando ela já
      // existe; sem base ainda, cai no "/100" pra não deixar o card mudo.
      variacao: dadosSaude?.scoreGeral !== null && dadosSaude?.scoreGeral !== undefined
        ? calcularVariacao(Math.round(dadosSaude.scoreGeral), snapshotComparavel?.scoreGeral ?? null)
        : null,
      sinal: dadosSaude?.scoreGeral !== null && dadosSaude?.scoreGeral !== undefined
        ? { texto: "/100", tom: "neutro" as const }
        : undefined,
      alerta: dadosSaude?.scoreGeral !== null && dadosSaude?.scoreGeral !== undefined && dadosSaude.scoreGeral < 50
        ? { nivel: dadosSaude.scoreGeral < 30 ? "critico" : "atencao", texto: dadosSaude.faixaGeralLabel ?? "Atenção" }
        : null,
    },
    explicacao: {
      resumo: "Uma nota de 0 a 100 que resume a saúde da operação: reputação, pós-venda, satisfação e catálogo, numa média ponderada.",
      pontos: [
        { titulo: "Quatro pilares, pesos diferentes", texto: "Reputação e pós-venda pesam mais que catálogo. Um problema de entrega reduz a pontuação mais do que um item sem foto." },
        { titulo: "Pilar sem dado sai da conta", texto: "Se um pilar não tiver informação suficiente no período, o peso será redistribuído entre os demais, em vez de virar zero." },
        { titulo: "Consolidado pesa por faturamento", texto: "Ao visualizar todas as marcas juntas, as que faturam mais influenciam mais o resultado. Não se trata de uma média simples entre marcas." },
      ],
      dica: "Toque em \"Ver a conta\" dentro do anel para ver exatamente quais pilares entraram e com que peso na pontuação exibida.",
    },
    preview: dadosSaude?.scoreGeral !== null && dadosSaude?.scoreGeral !== undefined
      // "PONTOS" no lugar da faixa ("EXCELENTE" etc.): a faixa não cabe
      // num anel de 56px em nenhum tamanho de fonte, mas ela já aparece
      // como texto normal embaixo do número no corpo do card — "pontos" é
      // curto o bastante pra caber e ainda diz o que o número é.
      // Sem faixaLabel: "pontos" apertava demais dentro do anel do tile.
      // A mesma informação já está clara pelo contexto (título "Pontuação
      // da loja" bem acima) sem precisar repetir dentro do círculo.
      ? (
        <>
          {/* Menor no mobile: o anel dividia a linha com o número/legenda
              ("WUWU lidera" cortava do mesmo jeito aqui) — 40px no lugar de
              56px libera espaço sem perder legibilidade do "89" dentro. */}
          <span className="lg:hidden"><AnelScore valor={dadosSaude.scoreGeral} cor={dadosSaude.faixaGeralCor ?? "var(--acento-2)"} tamanho={40} /></span>
          <span className="hidden lg:inline-block"><AnelScore valor={dadosSaude.scoreGeral} cor={dadosSaude.faixaGeralCor ?? "var(--acento-2)"} tamanho={56} /></span>
        </>
      )
      : undefined,
    // Mesmo alinhamento do card Marca: o anel sobe pra perto do número em
    // vez de centralizar na altura toda da fileira.
    previewAlinhamento: "start",
    chips: chipsDoFiltro,
    temLegendaStatus: true,
    render: (acaoSlot) => <ScoreCard dados={dadosSaude} carregando={carregandoSaude} acaoSlot={acaoSlot} />,
  }), [dadosSaude, carregandoSaude, faltaEscopo, snapshotComparavel, chipsDoFiltro]);

  const blocoComparacao = useMemo<BlocoDef>(() => {
    const marcasPorFaturamento = [...(dadosSaude?.marcas ?? [])]
      .sort((a, b) => b.faturamento - a.faturamento);
    const lider = marcasPorFaturamento[0];
    const vantagemDaLider = calcularVantagemPercentualDaLider(
      marcasPorFaturamento.map((marca) => marca.faturamento),
    );

    return ({
    id: "comparacao",
    secao: "financeiro",
    titulo: blocosCopy.comparacao.titulo,
    icone: BarChart3,
    // Mesma cor do ACENTO em comparacao-card.tsx.
    accent: "var(--acento-3)",
    carregando: carregandoSaude,
    semFiltro: faltaEscopo,
    resumo: {
      valor: dadosSaude ? String(dadosSaude.marcas.length) : null,
      // Quem está na frente por faturamento vira parte da legenda — a
      // resposta que o card dá antes de ser aberto.
      legenda: lider ? `${lider.marcaLabel} lidera em faturamento` : blocosCopy.comparacao.legenda,
      // Não é variação da quantidade de marcas: mede a distância real da
      // líder para a segunda colocada dentro do mesmo período/filtro.
      variacao: vantagemDaLider,
      rodape: vantagemDaLider === null
        ? "Compare ao menos duas marcas com faturamento"
        : "Vantagem sobre a 2ª colocada",
    },
    explicacao: {
      resumo: "Coloca as marcas ativas lado a lado e utiliza os mesmos critérios de medição. A liderança muda conforme o critério escolhido nas abas.",
      pontos: [
        { titulo: "Três critérios, um de cada vez", texto: "Valor médio por pedido, Cancelamento e Recorrência: a ordenação e a barra seguem o critério ativo." },
        { titulo: "Cor de cada linha é a da marca", texto: "O destaque visual (barra, borda, número) é sempre a identidade da marca, não muda com o critério." },
        { titulo: "Ponto de alerta ao lado do número", texto: "Cancelamento possui faixas objetivas. Um ponto colorido indica quando o valor requer atenção." },
        { titulo: "Cumprimento de pedidos", texto: "A barra embaixo de cada marca mostra o que aconteceu com os pedidos do período: entregues, em andamento, cancelados, devolvidos." },
      ],
      dica: "Cancelamento é o único critério em que o menor valor lidera. Por isso, 0% aparece no topo da classificação, e não no fim.",
    },
    preview: dadosSaude && dadosSaude.marcas.length > 0
      ? <BarrasMarca dados={dadosSaude.marcas.map((marca) => ({ slug: marca.marca, label: marca.marcaLabel, valor: marca.faturamento }))} />
      : undefined,
    previewAlinhamento: "start",
    // As marcas que ESTE card compara já respeitam o filtro global.
    chips: dadosSaude?.marcas.map((marca) => ({ slug: marca.marca, label: marca.marcaLabel })) ?? [],
    render: (acaoSlot) => (
      <ComparacaoCard
        dados={dadosSaude}
        carregando={carregandoSaude}
        acaoSlot={acaoSlot}
        posVenda={posVendaAtual}
        canais={canais}
        filtro={filtroGlobal}
        onChangeFiltro={setFiltroGlobal}
      />
    ),
    });
  }, [dadosSaude, carregandoSaude, faltaEscopo, posVendaAtual, canais, filtroGlobal]);

  const blocoReposicao = useMemo<BlocoDef>(() => ({
    id: "reposicao",
    secao: "estoque",
    titulo: blocosCopy.reposicao.titulo,
    icone: Package,
    accent: "var(--warning)",
    carregando: reposicao.carregando,
    semFiltro: reposicao.semFiltro,
    resumo: {
      valor: reposicao.dados ? String(reposicao.dados.reposicaoTotal) : null,
      legenda: blocosCopy.reposicao.legenda,
      variacao: reposicao.dados
        ? calcularVariacao(reposicao.dados.reposicaoTotal, snapshotComparavel?.reposicaoQtd ?? null)
        : null,
      // Mais itens precisando de reposição é notícia ruim, não boa — sem
      // isto a seta pra cima (mais SKUs em alerta) apareceria verde.
      subirEhRuim: true,
      // A lista já vem ordenada por urgência (menor cobertura primeiro),
      // então o primeiro item é o que acaba antes — o dado que decide se
      // isso é pra hoje ou pra semana que vem.
      sinal: (() => {
        const maisUrgente = reposicao.dados?.reposicao.find((item) => item.coberturaDias !== null);
        return maisUrgente?.coberturaDias !== undefined && maisUrgente?.coberturaDias !== null
          ? { texto: `menor: ${maisUrgente.coberturaDias}d`, tom: "ruim" as const }
          : undefined;
      })(),
      alerta: reposicao.dados && reposicao.dados.reposicaoTotal > 0
        ? { nivel: "atencao", texto: "repor" }
        : null,
    },
    explicacao: {
      resumo: "Mostra os produtos cujo saldo já atingiu ou ficou abaixo do estoque mínimo cadastrado. O objetivo é avisar a reposição antes que o saldo chegue a zero.",
      pontos: [
        { titulo: "Regra para entrar", texto: "O produto precisa estar ativo no CRM, ter saldo maior que zero, possuir estoque mínimo maior que zero e apresentar saldo igual ou inferior ao mínimo. Os filtros de marca e canal também são respeitados." },
        { titulo: "Como ler o número", texto: "O número principal é a quantidade total de produtos que atendem à regra. Todos eles aparecem na lista. Produto sem mínimo cadastrado não entra, pois não existe uma referência para comparar o saldo." },
        { titulo: "Cobertura estimada", texto: "Quando houve venda no período, a cobertura é calculada dividindo o saldo pelo consumo médio diário. Exemplo: saldo 19 e três vendas em um dia resultam em aproximadamente seis dias de cobertura. Trata-se de uma estimativa, não de uma garantia." },
        { titulo: "Ordem e status", texto: "Produtos com menor cobertura aparecem primeiro. Quando não há venda suficiente para estimar a cobertura, a prioridade considera o quanto o saldo ficou abaixo do mínimo. O selo informa se o anúncio está ativo, pausado, em revisão ou encerrado." },
      ],
      dica: "Saldo e status vêm dos dados confirmados pelo canal e das movimentações de pedidos. Este painel avisa sobre quantidade; ele não confirma prazo de compra, fornecedor ou mercadoria já encomendada.",
    },
    /* Barra = dias de cobertura restantes (barra curta = acaba antes =
       mais urgente, que é a mesma ordem da lista). Produtos sem consumo
       no período não têm cobertura calculável e ficam de fora do preview
       em vez de cair no saldo — dias e unidades são grandezas
       diferentes, e misturar as duas na mesma barra não compara nada. */
    preview: (() => {
      const comCobertura = (reposicao.dados?.reposicao ?? [])
        .filter((item): item is typeof item & { coberturaDias: number } => item.coberturaDias !== null)
        .slice(0, 3);
      return comCobertura.length > 0
        ? <MiniRanking itens={comCobertura.map((item) => ({ nome: item.nome, valor: item.coberturaDias, slug: item.marca }))} />
        : undefined;
    })(),
    previewAlinhamento: "sobrepor",
    temLegendaStatus: true,
    chips: chipsDoFiltro,
    render: (acaoSlot, acaoTopoSlot) => (
      <ReposicaoCard
        itens={reposicao.dados?.reposicao ?? null}
        total={reposicao.dados?.reposicaoTotal ?? 0}
        carregando={reposicao.carregando}
        semFiltro={reposicao.semFiltro}
        scope={escopo}
        escopoLink={escopoDoLinkEstoque}
        acaoSlot={acaoSlot}
        acaoTopoSlot={acaoTopoSlot}
      />
    ),
  }), [reposicao, escopo, escopoDoLinkEstoque, chipsDoFiltro, snapshotComparavel]);

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
      // Compara o produto líder atual com ele mesmo na janela anterior.
      variacao: maisVendidos.dados?.maisVendidos[0]?.variacaoPercentual ?? null,
    },
    explicacao: {
      resumo: "Classifica os produtos ativos que tiveram vendas válidas no período selecionado. A ordem considera a quantidade de unidades vendidas, não o faturamento.",
      pontos: [
        { titulo: "Regra para entrar", texto: "O produto precisa estar ativo no CRM e ter vendido pelo menos uma unidade no período. Pedidos cancelados ou devolvidos não contam. Os filtros de marca, canal e período são respeitados." },
        { titulo: "Como ler o número", texto: "O número principal é a quantidade vendida pelo produto líder. Ele não representa a quantidade de produtos da lista. Todos os produtos que tiveram venda válida aparecem ao abrir o painel." },
        { titulo: "Ordem e desempate", texto: "A maior quantidade vendida fica no topo. Se dois produtos venderam a mesma quantidade, aparece primeiro aquele que gerou maior faturamento no período." },
        { titulo: "Variação percentual", texto: "O percentual compara o produto líder atual com ele mesmo no período imediatamente anterior, usando uma janela de igual duração. Sem vendas anteriores para servir de base, nenhum percentual é mostrado." },
      ],
      dica: "O selo de status ajuda a identificar um risco operacional. Um produto líder com anúncio pausado, em revisão ou encerrado pode perder vendas mesmo tendo boa procura.",
    },
    preview: maisVendidos.dados && maisVendidos.dados.maisVendidos.length > 0
      // -mt-1.5: sobe um pouco a lista 1º/2º/3º dentro do próprio espaço
      // flutuante (ver "sobrepor" em bloco.tsx) — pedido específico deste
      // card, sem mexer nos outros três que usam o mesmo alinhamento.
      ? <span className="-mt-1.5 block"><MiniRanking itens={maisVendidos.dados.maisVendidos.slice(0, 3).map((item) => ({ nome: item.nome, valor: item.quantidade, slug: item.marca }))} /></span>
      : undefined,
    previewAlinhamento: "sobrepor",
    temLegendaStatus: true,
    chips: chipsDoFiltro,
    render: (acaoSlot) => (
      <MaisVendidosCard
        itens={maisVendidos.dados?.maisVendidos ?? null}
        total={maisVendidos.dados?.maisVendidosTotal ?? 0}
        carregando={maisVendidos.carregando}
        semFiltro={maisVendidos.semFiltro}
        scope={escopo}
        acaoSlot={acaoSlot}
      />
    ),
  }), [maisVendidos, escopo, chipsDoFiltro]);

  const blocoGiroBaixo = useMemo<BlocoDef>(() => ({
    id: "giroBaixo",
    secao: "estoque",
    titulo: blocosCopy.giroBaixo.titulo,
    icone: TrendingDown,
    // Era --acento-3 (rosa), a mesma cor de "Marca" e "Publicações" — 3
    // cards diferentes com a mesma identidade visual. --info (azul) não
    // era usada por nenhum card do mosaico até agora.
    accent: "var(--info)",
    carregando: giroBaixo.carregando,
    semFiltro: giroBaixo.semFiltro,
    resumo: {
      valor: giroBaixo.dados ? String(giroBaixo.dados.giroBaixoTotal) : null,
      legenda: blocosCopy.giroBaixo.legenda,
      variacao: giroBaixo.dados
        ? calcularVariacao(giroBaixo.dados.giroBaixoTotal, snapshotComparavel?.giroBaixoQtd ?? null)
        : null,
      // Mais itens em giro baixo é piora, não melhora.
      subirEhRuim: true,
      // `valorParado` (capital travado no item que mais dói) já vem
      // formatado do serviço e era descartado — é o que transforma "7
      // itens" em "7 itens segurando R$ X".
      sinal: giroBaixo.dados && giroBaixo.dados.giroBaixoValorParadoNumerico > 0
        ? { texto: formatarReaisCompacto(giroBaixo.dados.giroBaixoValorParadoNumerico), tom: "ruim" as const }
        : undefined,
    },
    explicacao: {
      resumo: "Mostra produtos ativos, com saldo positivo, que ainda venderam no período, mas ficaram abaixo da régua proporcional de 10 unidades por semana.",
      pontos: [
        { titulo: "Regra para entrar", texto: "O produto precisa estar ativo no CRM, ter saldo maior que zero, registrar pelo menos uma venda válida no período e ter vendido abaixo do limite proporcional. Também precisa ter uma venda nos últimos 15 dias; caso contrário, pertence a Estoque parado." },
        { titulo: "Régua proporcional", texto: "O limite é calculado por 10 ÷ 7 × quantidade de dias. Em Hoje, uma venda entra e duas não entram. Em sete dias, entram quantidades de uma a nove. Pedidos cancelados ou devolvidos ficam fora da conta." },
        { titulo: "Como ler os valores", texto: "O número principal é a quantidade total de produtos classificados. O valor em reais soma preço de venda multiplicado pelo saldo. Portanto, representa valor bruto potencial do estoque, não custo de aquisição nem lucro." },
        { titulo: "Ordem e status", texto: "Quem vendeu menos aparece primeiro. Em caso de empate, o maior valor bruto em estoque define a ordem. Um anúncio pausado ou em revisão pode indicar problema operacional, não falta de procura." },
      ],
      dica: "O período muda a régua e pode alterar bastante a lista. Para uma leitura menos volátil do giro, prefira uma janela de sete dias ou mais.",
    },
    preview: giroBaixo.dados && giroBaixo.dados.giroBaixoTotal > 0 && snapshotComparavel
      ? (
        <BarrasTendencia
          dados={[snapshotComparavel.giroBaixoQtd, giroBaixo.dados.giroBaixoTotal]}
          cor="var(--info)"
          largura={96}
          altura={36}
          classeResponsiva="w-14 h-6 lg:w-24 lg:h-9"
        />
      )
      : undefined,
    previewAlinhamento: "sobrepor",
    temLegendaStatus: true,
    chips: chipsDoFiltro,
    render: (acaoSlot) => (
      <GiroBaixoCard
        itens={giroBaixo.dados?.giroBaixo ?? null}
        total={giroBaixo.dados?.giroBaixoTotal ?? 0}
        carregando={giroBaixo.carregando}
        semFiltro={giroBaixo.semFiltro}
        scope={escopo}
        acaoSlot={acaoSlot}
      />
    ),
  }), [giroBaixo, escopo, chipsDoFiltro, snapshotComparavel]);

  const blocoParados = useMemo<BlocoDef>(() => ({
    id: "parados",
    secao: "estoque",
    titulo: blocosCopy.parados.titulo,
    icone: Hourglass,
    accent: "var(--muted-foreground)",
    carregando: parados.carregando,
    semFiltro: parados.semFiltro,
    resumo: {
      // Valor bruto total de todos os itens classificados. A lista aberta
      // recebe o mesmo universo completo, sem corte visual.
      valor: parados.dados && parados.dados.paradosTotal > 0
        ? formatarReaisCompacto(parados.dados.paradosValorParadoNumerico)
        : parados.dados ? "R$ 0" : null,
      legenda: parados.dados ? `${parados.dados.paradosTotal} ${blocosCopy.parados.legenda}` : blocosCopy.parados.legenda,
      variacao: parados.dados
        ? calcularVariacao(parados.dados.paradosTotal, snapshotComparavel?.paradosQtd ?? null)
        : null,
      // Mais itens parados é piora, não melhora.
      subirEhRuim: true,
      alerta: parados.dados && parados.dados.paradosTotal > 0 ? { nivel: "atencao", texto: "parados" } : null,
    },
    explicacao: {
      resumo: "Mostra produtos ativos, com saldo positivo, que não registraram nenhuma venda válida nos últimos 15 dias ou que nunca tiveram venda associada no histórico disponível do CRM.",
      pontos: [
        { titulo: "Regra para entrar", texto: "O produto precisa estar ativo no CRM, não estar excluído e possuir saldo maior que zero. A última venda válida deve ter ocorrido há 15 dias ou mais. Pedidos cancelados ou devolvidos não contam como venda." },
        { titulo: "Quem nunca vendeu", texto: "Produto sem nenhuma venda associada também entra. Isso significa sem venda registrada no histórico disponível do CRM; não prova que o produto nunca tenha vendido antes da implantação ou fora dos dados importados." },
        { titulo: "Como ler os valores", texto: "O número da legenda é a quantidade total de produtos parados. O valor principal soma preço de venda multiplicado pelo saldo. Ele representa valor bruto potencial do estoque, não custo de aquisição nem lucro." },
        { titulo: "Período, ordem e status", texto: "O corte de 15 dias é fixo e não muda com o período dos outros cards. A lista começa pelo maior valor bruto em estoque. O selo informa se o anúncio está ativo, pausado, em revisão ou encerrado." },
      ],
      dica: "Antes de liquidar, confira a data de cadastro, a qualidade do histórico importado e o status do anúncio. Um item novo ou sem histórico completo pode aparecer aqui sem representar encalhe real.",
    },
    /* Barra = dias parado (barra longa = parado há mais tempo = pior).
       `diasParado` nulo significa "nunca vendeu" — o caso MAIS grave, não
       o menos: com `?? 0` ele virava barra zerada, lendo como se fosse o
       melhor da lista. Aqui ele assume o teto da escala. */
    preview: (() => {
      const top = (parados.dados?.parados ?? []).slice(0, 3);
      if (top.length === 0) return undefined;
      const maiorDias = Math.max(...top.map((item) => item.diasParado ?? 0), 1);
      return (
        <MiniRanking
          // Este card fecha a grade sozinho, na linha inteira (ver
          // `destaqueFinal`), então sobra espaço entre o número e a lista —
          // o nome do produto aparece bem mais aqui do que nos cards da
          // grade de 2 colunas.
          largo
          itens={top.map((item) => ({
            nome: item.nome,
            valor: item.diasParado ?? maiorDias,
            slug: item.marca,
          }))}
        />
      );
    })(),
    temLegendaStatus: true,
    chips: chipsDoFiltro,
    render: (acaoSlot, acaoTopoSlot) => (
      <ParadosCard
        itens={parados.dados?.parados ?? null}
        total={parados.dados?.paradosTotal ?? 0}
        carregando={parados.carregando}
        semFiltro={parados.semFiltro}
        scope={escopo}
        escopoLink={escopoDoLinkEstoque}
        acaoSlot={acaoSlot}
        acaoTopoSlot={acaoTopoSlot}
      />
    ),
  }), [parados, escopo, escopoDoLinkEstoque, chipsDoFiltro, snapshotComparavel]);

  // Só existe com marca conectada — um bloco que abriria vazio não vira bloco.
  const blocoPublicacoes = useMemo<BlocoDef | null>(() => {
    if (marcasPublicacoes.length === 0) return null;
    return {
      id: "publicacoes",
    secao: "marketing",
      titulo: blocosCopy.publicacoes.titulo,
      icone: Megaphone,
      accent: "var(--acento-3)",
      carregando: carregandoPublicacoes,
      semFiltro: !publicacoesNoEscopo || idsPublicacoes.length === 0,
      resumo: {
        // Receita atribuída pelo próprio Product Ads, comparada com a janela
        // anterior de mesmo tamanho. Nenhum número nasce no cliente.
        valor: resumoPublicacoesAtual ? formatarReaisCompacto(resumoPublicacoesAtual.receita) : null,
        variacao: resumoPublicacoesAtual?.variacaoReceitaPercentual ?? null,
        legenda: resumoPublicacoesAtual
          ? `${resumoPublicacoesAtual.totalPublicacoes} publicações · ${resumoPublicacoesAtual.comVeiculacao} com veiculação`
          : resumoPublicacoes.falhou && resumoPublicacoes.chave === chavePublicacoes
            ? "Não foi possível consultar"
            : blocosCopy.publicacoes.legenda,
      },
      explicacao: {
        resumo: "Como cada anúncio patrocinado se saiu nos canais selecionados durante o período, sem misturar vendas orgânicas com resultados da publicidade.",
        pontos: [
          { titulo: "Impressões, cliques e vendas atribuídas", texto: "Cada número vem da medição de publicidade do próprio canal do anúncio. As vendas orgânicas ficam fora para não distorcer a conversão." },
          { titulo: "Investimento, receita e retorno", texto: "O retorno compara a receita que o canal atribuiu ao anúncio com o valor investido exatamente no período selecionado." },
          { titulo: "Pontuação de qualidade", texto: "É a nota que o Mercado Livre atribui ao anúncio, considerando ficha técnica, fotos e atributos preenchidos. A Shopee não publica nota equivalente, e por isso os anúncios dela aparecem como \"não aplicável\" — não é nota zero." },
          { titulo: "De quando é cada número", texto: "O Mercado Livre é consultado na hora. Os da Shopee vêm da sincronização diária de publicidade, e o card mostra a data e a hora dela." },
        ],
        dica: "Publicações sem qualquer veiculação ficam separadas para não esconder os anúncios que realmente consumiram verba ou geraram resultado.",
      },
      chips: marcasPublicacoes
        .filter((marca) => idsPublicacoes.includes(marca.brandId))
        .map((marca) => ({ slug: marca.marca, label: marca.marcaLabel })),
      render: (acaoSlot) => (
        <PublicacoesCard
          marcas={marcasPublicacoes.map((marca) => ({ brandId: marca.brandId, marcaLabel: marca.marcaLabel, slug: marca.marca }))}
          inicio={periodoPublicacoes.inicio}
          fim={periodoPublicacoes.fim}
          brandIdsIniciais={idsPublicacoes}
          canaisIniciais={canaisPublicacoes}
          acaoSlot={acaoSlot}
        />
      ),
    };
  }, [
    marcasPublicacoes, carregandoPublicacoes, publicacoesNoEscopo,
    idsPublicacoes, canaisPublicacoes, resumoPublicacoesAtual, resumoPublicacoes,
    chavePublicacoes, periodoPublicacoes.inicio, periodoPublicacoes.fim,
  ]);

  // Junta, separa em seções (Financeiro / Saúde / Atendimento / Estoque /
  // Marketing) e ordena por urgência dentro de cada uma — o trabalho pesado
  // (recriar cada bloco) já aconteceu nos memos acima, isolado por grupo.
  const { grupos, lista: blocos } = useMemo(() => agruparPorSecao([
    blocoFaturamento, blocoScore, blocoReposicao, blocoComparacao,
    blocoMaisVendidos, blocoGiroBaixo, blocoParados,
    ...(blocoPublicacoes ? [blocoPublicacoes] : []),
  ]), [
    blocoFaturamento, blocoScore, blocoReposicao, blocoComparacao,
    blocoMaisVendidos, blocoGiroBaixo, blocoParados,
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
     pedir um novo payload ao servidor.

     `abrir` usa `pushState`, não `replaceState`: sem uma entrada própria no
     histórico, o botão/gesto de voltar do celular pulava o card aberto
     inteiro e saía da tela de Métricas (achado real — "acesso o card e
     volto, ele some"). Com `pushState`, voltar fecha só o card (dispara
     `popstate`, o App Router relê a URL sem `?card=` e a grade volta a
     aparecer) — mesmo comportamento de qualquer modal com deep link.
     `fechar` continua com `replaceState`: fechar pelo X/Esc não deve
     empilhar mais uma entrada de histórico. */
  const abrir = useCallback((id: string) => {
    window.history.pushState(null, "", `/metricas?card=${encodeURIComponent(id)}`);
  }, []);

  const fechar = useCallback(() => {
    window.history.replaceState(null, "", "/metricas");
  }, []);

  const pular = useCallback((passo: number) => {
    if (blocos.length === 0 || indiceAberto < 0) return;
    const proximo = (indiceAberto + passo + blocos.length) % blocos.length;
    // `replaceState`, não `abrir` (que empilha): trocar de card com as setas
    // é navegação DENTRO do mesmo painel aberto, não uma nova abertura — se
    // empilhasse, voltar uma vez só fecharia o card anterior da sequência
    // em vez da grade inteira.
    window.history.replaceState(null, "", `/metricas?card=${encodeURIComponent(blocos[proximo].id)}`);
  }, [blocos, indiceAberto]);

  // Um ?card= que não existe (link antigo, bloco que sumiu com o filtro) fica
  // como um parâmetro morto na URL em vez de abrir nada — limpa sozinho.
  useEffect(() => {
    if (cardAberto && indiceAberto < 0 && blocos.length > 0) fechar();
  }, [cardAberto, indiceAberto, blocos.length, fechar]);

  /* Versão desktop/tablet: uma grade única, todos os cards do mesmo tamanho,
   *  em vez de uma linha inteira por seção — era isso que fazia o card mudar
   *  de tamanho de linha pra linha (2 cards largos em Financeiro, 4 cards
   *  estreitos em Estoque) e sobrar buraco quando uma seção tinha poucos
   *  itens. A seção não desaparece: cada card carrega o próprio rótulo de
   *  seção como selo pequeno (ver `secaoLabel` em `Bloco`). Só afeta lg+; no
   *  mobile a lista abaixo continua agrupada por seção, uma por linha, como
   *  sempre foi. */
  const blocosComSecao = useMemo(
    () => grupos.flatMap((grupo) => grupo.blocos.map((bloco) => ({ bloco, secaoLabel: grupo.label }))),
    [grupos],
  );

  /* Faturamento sempre abre a grade em destaque, linha inteira — a métrica
   *  primária de qualquer marca. Já foi dinâmico ("o mais urgente do
   *  momento sobe"), mas isso fazia o topo trocar de card sozinho conforme
   *  o dado do dia — a urgência continua sinalizada onde ela nasce: o
   *  ponto colorido e a borda de alerta no próprio card, dentro da grade.
   *
   *  Estoque Parado tem dois tratamentos por tamanho de tela:
   *  · Mobile (1x2x2x2x1): fecha a grade sozinho, linha inteira — mesmo
   *    tratamento do Faturamento — porque no mobile os cards já empilham
   *    em pares e um fechamento largo lê melhor que um par quebrado.
   *  · Desktop/tablet: fica DENTRO da grade normal, na posição natural que
   *    já tinha (último item de Estoque, logo antes de Marketing/
   *    Publicações) — a pedido do usuário, ao lado de Marketing em vez de
   *    virar uma segunda linha em destaque. `resto` mantém Parados pra
   *    isso; só o `destaqueFinal` (usado só no bloco mobile) o extrai. */
  const { destaque, resto, destaqueFinal } = useMemo(() => {
    const escolhido = blocosComSecao.find((item) => item.bloco.id === "faturamento") ?? blocosComSecao[0];
    const final = blocosComSecao.find((item) => item.bloco.id === "parados" && item.bloco.id !== escolhido?.bloco.id);
    return {
      destaque: escolhido,
      destaqueFinal: final,
      resto: blocosComSecao.filter((item) => item.bloco.id !== escolhido?.bloco.id),
    };
  }, [blocosComSecao]);

  // Versão do `resto` só pro mobile: sem Parados, que ali sai da grade e
  // fecha sozinho em destaque (ver `destaqueFinal`, usado só no bloco lg:hidden).
  const restoMobile = useMemo(
    () => resto.filter((item) => item.bloco.id !== destaqueFinal?.bloco.id),
    [resto, destaqueFinal],
  );

  return (
    <>
      <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-3">
        {marcas.length > 0 && <CoachMarks storageKey="crm-leo:coachmarks:mosaico:v1" steps={TOUR} />}

        {/* Barra de escopo única — marca/canal (com as logos reais, via
            ScopeRow) + Período/Hoje, valendo pra todos os previews ao mesmo
            tempo. Fica sempre visível (mesmo com um card aberto por cima,
            ver Foco), então trocar marca ou data não exige fechar o painel
            primeiro.

            Duas fileiras de verdade só no mobile (flex-col, onde a largura
            obriga tudo a empilhar de qualquer forma): canal + marca em cima
            (o filtro de ESCOPO — quais dados aparecem) e o Período embaixo
            (o filtro de TEMPO — quando). A partir do sm, onde sobra largura, os dois
            grupos voltam a viver numa fileira única (`sm:contents` devolve
            os filhos à sequência natural do flex pai) — igual sempre foi
            no desktop, só com canal/marca na ordem corrigida (ver
            ScopeRow). Sem fundo card/sombra: a barra vira só estrutura
            (borda + separadores), no mesmo nível visual do resto da tela,
            em vez de competir como se fosse mais um card. */}
        <div className="flex flex-col gap-2 rounded-[1.25rem] border border-border px-3 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center">
          <div className="flex flex-wrap items-center justify-center gap-2 sm:contents">
            {escopo}
          </div>

          {/* No mobile o traço horizontal cortava a barra em duas e pesava a
              leitura — some ali, mas o elemento fica: é ele que garante o
              respiro entre escopo e período. No desktop segue como o
              divisor vertical de sempre. */}
          <span aria-hidden="true" className="h-px w-full shrink-0 sm:h-6 sm:w-px sm:self-stretch sm:bg-border" />

          {/* No mobile empilha (`flex-col`): o botão Período fica sozinho na
              sua linha, perfeitamente centralizado, e o intervalo escolhido
              desce pra linha de baixo. Lado a lado, o texto do intervalo
              puxava o botão pra esquerda do centro. A partir do sm,
              `sm:contents` devolve os dois à fileira única de sempre. */}
          <div className="flex flex-col items-center gap-1 sm:contents">
            {/* semHoje: o botão avulso era redundante com o atalho "Hoje"
                que já existe dentro do próprio popover de Período (ver
                CalendarioPopoverRange) — pedido explícito pra tirar da
                barra de escopo global. */}
            <BarraPeriodo periodo={periodo} trocarDatas={trocarDatas} periodoLabel={dadosSaude?.periodoLabel} semHoje />
          </div>
        </div>

        {/* Permanece dentro do container compartilhado de 1440px para que a
            proporção do mosaico seja a mesma em Safari, Windows e telas 2xl. */}
        <div data-coachmark="mosaico-grade">
          {/* Mobile: 1x2x2x2x1 — Faturamento sozinho na primeira linha, os
              demais em pares no meio, Estoque Parado sozinho na última. Mesmo
              estilo "grande" (com preview) em todos; o card escuro/linha-única
              do hero é só tablet/desktop (ver abaixo) — aqui os dois destaques
              aparentam iguais aos demais, só que ocupando a largura toda.

              Os pares vivem numa grade PRÓPRIA, com `auto-rows-fr`: cada card
              tem uma quantidade diferente de conteúdo no preview (Vendem mais
              lista três produtos, Pontuação da loja mostra só um anel), e com
              a altura saindo do conteúdo os seis ficavam visivelmente
              desiguais entre uma linha e outra. Igualar pela mais alta é o que
              faz a coluna parecer uma grade, e não cards soltos.

              A grade é separada de propósito: com Faturamento e Estoque parado
              dentro dela, `auto-rows-fr` esticaria TODAS as linhas até a altura
              do Faturamento, que é o card mais alto da tela — o vazio enorme
              que o comentário da versão desktop, logo abaixo, descreve. */}
          <div className="flex flex-col gap-3 lg:hidden">
            {destaque && (
              <ul>
                <Bloco
                  key={destaque.bloco.id}
                  def={destaque.bloco}
                  focado={destaque.bloco.id === cardAberto}
                  onAbrir={() => abrir(destaque.bloco.id)}
                  variante="grande"
                  ativoLayout={!ehDesktop}
                />
              </ul>
            )}
            <ul className="grid auto-rows-fr grid-cols-2 gap-3">
              {restoMobile.map(({ bloco }) => (
                <Bloco key={bloco.id} def={bloco} focado={bloco.id === cardAberto} onAbrir={() => abrir(bloco.id)} variante="grande" ativoLayout={!ehDesktop} />
              ))}
            </ul>
            {destaqueFinal && (
              <ul>
                <Bloco
                  key={destaqueFinal.bloco.id}
                  def={destaqueFinal.bloco}
                  focado={destaqueFinal.bloco.id === cardAberto}
                  onAbrir={() => abrir(destaqueFinal.bloco.id)}
                  variante="grande"
                  ativoLayout={!ehDesktop}
                />
              </ul>
            )}
          </div>

          {/* Tablet/desktop: um card em destaque no topo (Faturamento, linha
              inteira) e os demais numa grade de 2 colunas (4 a partir de
              xl) — Estoque Parado fica dentro dessa grade, na posição
              natural (último item de Estoque, logo antes de Marketing),
              em vez de virar uma segunda linha em destaque só aqui. */}
          <div className="hidden lg:flex lg:flex-col lg:gap-3">
            {destaque && (
              <ul>
                <Bloco
                  key={destaque.bloco.id}
                  def={destaque.bloco}
                  focado={destaque.bloco.id === cardAberto}
                  onAbrir={() => abrir(destaque.bloco.id)}
                  secaoLabel={destaque.secaoLabel}
                  variante="destaque"
                  ativoLayout={ehDesktop}
                />
              </ul>
            )}
            {/* Sem altura travada de propósito: forçar o conjunto a preencher
                a viewport (`h-[calc(100dvh-…)]` + `auto-rows-fr`) esticava os
                cards e abria um vazio enorme entre o título e o número. A
                altura sai do conteúdo; `items-start` impede que a linha da
                grade estique os cards mais baixos pra acompanhar o mais alto. */}
            <ul className="grid grid-cols-2 items-start gap-3 xl:grid-cols-4">
              {resto.map(({ bloco, secaoLabel }) => (
                <Bloco key={bloco.id} def={bloco} focado={bloco.id === cardAberto} onAbrir={() => abrir(bloco.id)} secaoLabel={secaoLabel} variante="grande" ativoLayout={ehDesktop} />
              ))}
            </ul>
          </div>
        </div>
      </motion.div>


      <Foco
        def={blocoAberto}
        onFechar={fechar}
        onAnterior={() => pular(-1)}
        onProximo={() => pular(1)}
        barraPeriodo={
          // Repor em breve não tem Período (ver semPeriodo em BarraPeriodo) —
          // e também não mostra mais "atualizado às": a idade do dado agora
          // vive só no painel de Atualizações do cabeçalho, um lugar só em
          // vez de repetida em cada canto da tela.
          blocoAberto?.id === "reposicao" ? null : (
            <BarraPeriodo
              periodo={periodo}
              trocarDatas={trocarDatas}
              periodoLabel={dadosSaude?.periodoLabel}
              accent={blocoAberto?.accent}
              semHoje={blocoAberto?.id === "comparacao" || blocoAberto?.id === "faturamento"}
            />
          )
        }
      />
    </>
  );
}
