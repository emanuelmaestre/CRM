import { saldoPublicadoAtual } from "@/modules/estoque/infrastructure/saldo-canais";
import { and, eq, gte, inArray, isNull, lte, max, sql } from "drizzle-orm";
import { differenceInCalendarDays, startOfDay, startOfHour, startOfMonth, startOfWeek, subDays, subMonths, subWeeks } from "date-fns";
import type { CrudContext } from "@/shared/lib/crud-factory";
import { liquidoDoPedido } from "@/modules/vendas/domain/liquido-pedido";
import { calcularComposicaoFaturamento } from "@/modules/metricas/domain/composicao-faturamento";
import {
  reembolsoParcialInformado,
  STATUS_PEDIDO_FATURAVEL,
  valorFaturavelPedido,
} from "@/modules/vendas/domain/status-faturamento";
import { pagamentoAprovadoPedidoSql, dataVendaPedidoSql, pedidoComercialSql } from "@/modules/vendas/infrastructure/valor-faturamento.sql";
import {
  brand,
  channelAccount,
  pedido,
  pedidoItem,
  produto,
  produtoCanal,
} from "@/shared/lib/db/schema";
import { getBrandConfig } from "@/shared/config/brands";

/* ── Parâmetros de negócio ───────────────────────────────────────
   Valores que definem o que conta como "atenção", "giro baixo" e
   "parado". Ficam nomeados aqui para serem discutíveis e ajustáveis
   sem caçar número mágico no meio de query. */

/** Menos que isto de vendas por semana conta como giro baixo — a taxa é fixa
 *  por semana; o limite real usado na filtragem escala com a janela do
 *  período em análise (ver `LIMITE_GIRO_BAIXO_POR_SEMANA / 7 * janelaDias`). */
const LIMITE_GIRO_BAIXO_POR_SEMANA = 10;

/** Dias sem nenhuma saída de estoque para o item ser considerado parado. */
const DIAS_PARA_PARADO = 15;

/** Quantos itens cada lista traz. Lista curta é lista que se lê. */
const LIMITE_ITENS_LISTA = 50;

export type Granularidade = "dia" | "semana" | "mes";

/** Janela de análise de produto acompanha a lente de faturamento escolhida. */
const JANELA_DIAS: Record<Granularidade, number> = { dia: 30, semana: 84, mes: 365 };

/** Quantos pontos a série temporal mostra em cada lente. */
const PONTOS_SERIE: Record<Granularidade, number> = { dia: 14, semana: 12, mes: 12 };

const GRANULARIDADE_LABEL: Record<Granularidade, string> = {
  dia: "Últimos 30 dias",
  semana: "Últimas 12 semanas",
  mes: "Últimos 12 meses",
};

export interface DashboardFilters {
  granularidade?: Granularidade;
  /** Uma ou mais marcas — ao marcar várias, os resultados se somam (união, não interseção). */
  brandId?: string | string[];
  /** Um ou mais canais — mesma lógica de união do brandId. */
  canal?: string | string[];
  /** Período personalizado (ISO). Quando os dois vêm preenchidos, substitui a
   *  janela fixa da granularidade — a série passa a ser sempre por dia. */
  inicio?: string;
  fim?: string;
}

export interface SeriePonto {
  label: string;
  valor: number;
  /** Altura relativa (0–100) já normalizada, para o gráfico não recalcular. */
  altura: number;
}

export interface FaturamentoResumo {
  granularidade: Granularidade;
  total: string;
  totalNumerico: number;
  /** Variação percentual contra a janela anterior de mesmo tamanho. Null quando não há base de comparação. */
  variacaoPercentual: number | null;
  /** Total (numérico e formatado) da janela anterior — o denominador exato por trás de `variacaoPercentual`. */
  totalAnteriorNumerico: number;
  totalAnterior: string;
  /** Mesmo formato de `janelaLabel`, para o período anterior — ex.: "01/07 – 30/07". */
  janelaAnteriorLabel: string;
  pedidos: number;
  ticketMedio: string;
  serie: SeriePonto[];
  janelaLabel: string;
  /** Faturamento líquido. Quando o canal informa o repasse real (`valor_liquido`
   *  — hoje a Shopee, via escrow), é ele que vale: já vem com tarifas, subsídios
   *  e ajustes que a estimativa não tem como enxergar. Sem esse dado (Mercado
   *  Livre e canais manuais), cai na estimativa `total - taxas conhecidas -
   *  frete`, que não desconta desconto/acréscimo nem custo do produto. Mesmo
   *  critério do detalhe do pedido — os dois precisam bater na mesma janela. */
  totalLiquidoNumerico: number;
  totalLiquido: string;
  totalAnteriorLiquidoNumerico: number;
  totalAnteriorLiquido: string;
  variacaoPercentualLiquido: number | null;
  ticketMedioLiquido: string;
  serieLiquido: SeriePonto[];
  /** Decomposição aditiva e reversível entre receita confirmada e o bruto
   * comparável ao canal. `pedido.total` permanece intacto no banco. */
  composicao?: {
    pedidosBrutosNumerico: number;
    pedidosBrutos: string;
    pedidosBrutosQtd: number;
    canceladosDevolvidosNumerico: number;
    canceladosDevolvidos: string;
    canceladosDevolvidosQtd: number;
    reembolsosParciaisNumerico: number;
    reembolsosParciais: string;
    pedidosComReembolsoParcialQtd: number;
  };
}

interface ProdutoBase {
  produtoId: string;
  sku: string;
  nome: string;
  marca: string;
  marcaLabel: string;
}

export interface ProdutoMaisVendido extends ProdutoBase {
  quantidade: number;
  /** Quantidade vendida pelo mesmo produto na janela imediatamente anterior. */
  quantidadeAnterior: number;
  /** Variação contra a janela anterior. Null quando o produto não vendeu antes. */
  variacaoPercentual: number | null;
  receita: string;
  /** Participação (0–100) na receita do topo da lista, para a barra de proporção. */
  participacao: number;
  statusAnuncio: StatusAnuncioParado;
  motivoStatus: string | null;
}

export interface ProdutoGiroBaixo extends ProdutoBase {
  quantidade: number;
  saldo: number;
  valorParado: string;
  statusAnuncio: StatusAnuncioParado;
  motivoStatus: string | null;
}

/** Status real do anúncio no Mercado Livre — sem isso, "parado" parecia
 *  sempre "ninguém compra" quando às vezes é "o próprio vendedor pausou". */
export type StatusAnuncioParado = "ativo" | "pausado" | "em_revisao" | "encerrado" | "sem_vinculo" | "nao_consultado";

export interface ProdutoParado extends ProdutoBase {
  saldo: number;
  /** Dias desde a última saída. Null quando nunca teve saída registrada. */
  diasParado: number | null;
  valorParado: string;
  statusAnuncio: StatusAnuncioParado;
  /** Razão específica dentro do status, já traduzida (ex.: "pausado por você"). */
  motivoStatus: string | null;
}

export interface ProdutoReposicao extends ProdutoBase {
  saldo: number;
  minimo: number;
  /** Dias de estoque restantes no ritmo de venda atual. Null sem histórico de venda. */
  coberturaDias: number | null;
  /** Quão perto do mínimo está (0–100): 100 = encostando no mínimo. */
  urgencia: number;
  statusAnuncio: StatusAnuncioParado;
  motivoStatus: string | null;
}

export interface DashboardData {
  faturamento: FaturamentoResumo;
  maisVendidos: ProdutoMaisVendido[];
  maisVendidosTotal: number;
  giroBaixo: ProdutoGiroBaixo[];
  giroBaixoTotal: number;
  giroBaixoValorParadoNumerico: number;
  giroBaixoValorParado: string;
  parados: ProdutoParado[];
  paradosTotal: number;
  paradosValorParadoNumerico: number;
  paradosValorParado: string;
  reposicao: ProdutoReposicao[];
  reposicaoTotal: number;
}

/* ── Formatação ───────────────────────────────────────────────── */

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(value);
}

function parseMoney(value: string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function brandLabel(slug: string): string {
  return getBrandConfig(slug)?.label ?? slug;
}

const diaMes = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });
const diaMesAno = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
const mesAno = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" });

/* ── Séries temporais ─────────────────────────────────────────── */

/** Início do balde a que uma data pertence, na granularidade pedida. */
function inicioDoBalde(data: Date, granularidade: Granularidade): Date {
  if (granularidade === "mes") return startOfMonth(data);
  if (granularidade === "semana") return startOfWeek(data, { weekStartsOn: 1 });
  return startOfDay(data);
}

function recuarBaldes(referencia: Date, granularidade: Granularidade, quantidade: number): Date {
  if (granularidade === "mes") return subMonths(referencia, quantidade);
  if (granularidade === "semana") return subWeeks(referencia, quantidade);
  return subDays(referencia, quantidade);
}

function rotuloDoBalde(inicio: Date, granularidade: Granularidade): string {
  if (granularidade === "mes") return mesAno.format(inicio).replace(".", "");
  return diaMes.format(inicio);
}

/** Baldes vazios da janela, do mais antigo ao mais recente — garante que
 *  período sem venda apareça como vale no gráfico, não como buraco. */
function montarBaldes(agora: Date, granularidade: Granularidade, totalPontos?: number): Map<number, number> {
  const total = totalPontos ?? PONTOS_SERIE[granularidade];
  const baldes = new Map<number, number>();
  for (let i = total - 1; i >= 0; i--) {
    const inicio = inicioDoBalde(recuarBaldes(agora, granularidade, i), granularidade);
    baldes.set(inicio.getTime(), 0);
  }
  return baldes;
}

const horaCurta = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", timeZone: "America/Sao_Paulo" });

/** Baldes por HORA — só para quando a janela pedida é 1 dia só (ex.:
 *  filtro "Hoje"). Nesse caso, baldear por dia dá 1 ponto só e a série
 *  não tem como desenhar uma linha de verdade; por hora usa os
 *  `pedido.createdAt` reais do próprio dia, sem inventar nenhum dado, só
 *  numa resolução mais fina que a diária.
 *
 *  Anda pra FRENTE a partir de `inicio` (em vez de pra trás a partir de
 *  `fim`): andando pra trás a partir de 23:59 sobrava um balde do dia
 *  anterior no começo da série. E quem chama corta `fim` no horário atual
 *  — hora que ainda não aconteceu não é "faturou zero", é "ainda não
 *  chegou"; incluí-la desenhava uma queda a zero que não existe. */
function montarBaldesHora(inicio: Date, fim: Date): Map<number, number> {
  const baldes = new Map<number, number>();
  const ultimo = startOfHour(fim).getTime();
  for (let cursor = startOfHour(inicio).getTime(); cursor <= ultimo; cursor += 60 * 60 * 1000) {
    baldes.set(cursor, 0);
  }
  return baldes;
}

/* ── Consulta principal ───────────────────────────────────────── */

/** Normaliza um filtro de string|string[] opcional numa lista sem vazios; [] quando ausente. */
function normalizarLista(valor?: string | string[]): string[] {
  if (!valor) return [];
  const lista = Array.isArray(valor) ? valor : [valor];
  return lista.filter(Boolean);
}

function normalizarFiltros(filters?: DashboardFilters) {
  const granularidade = filters?.granularidade;
  return {
    granularidade: (granularidade && granularidade in JANELA_DIAS ? granularidade : "dia") as Granularidade,
    brandIds: normalizarLista(filters?.brandId),
    canais: normalizarLista(filters?.canal),
  };
}

/** Mesmo padrão do Estoque: EXISTS em vez de JOIN, porque um produto pode ter
 *  mais de um mapeamento ativo no mesmo canal e um JOIN duplicaria a linha. */
function condicaoCanalProduto(orgId: string, canais: string[]) {
  return sql`exists (
    select 1 from ${produtoCanal}
    inner join ${channelAccount} on ${channelAccount.id} = ${produtoCanal.channelAccountId}
    where ${produtoCanal.produtoId} = ${produto.id}
      and ${produtoCanal.orgId} = ${orgId}
      and ${produtoCanal.ativo} = true
      and ${channelAccount.tipo} in ${canais}
  )`;
}

/** "2026-08-14" → meia-noite (ou 23:59:59.999) em São Paulo, não em UTC nem no
 *  fuso do processo. `new Date("2026-08-14")` cairia na armadilha clássica:
 *  strings de data pura viram meia-noite UTC pelo spec do JS, e em produção
 *  (Vercel) o processo roda em UTC por padrão — meia-noite UTC vira "dia
 *  anterior, 21h" em Brasília, deslocando janela/série/comparativo. E
 *  `new Date(ano, mes-1, dia)` só corrige isso se o processo já estiver no
 *  fuso certo, o que não é garantido fora deste ambiente local. O offset
 *  `-03:00` fixo funciona em qualquer servidor: Brasil não observa horário de
 *  verão desde 2019, então América/São Paulo é UTC-3 o ano inteiro. Por isso
 *  este parse (e o `endOfDay`/`startOfDay` do date-fns, que também dependem
 *  do fuso do processo) não pode ser usado para os limites do período. */
function parseDataLocal(iso: string, fimDoDia = false): Date {
  return new Date(`${iso}T${fimDoDia ? "23:59:59.999" : "00:00:00.000"}-03:00`);
}

const SUB_STATUS_LABEL: Record<string, string> = {
  paused_by_seller: "pausado por você",
  out_of_stock: "sem estoque no anúncio",
  item_idle: "ocioso há muito tempo, pausado automaticamente",
  deleted: "excluído",
  by_admin: "removido pelo Mercado Livre",
};

/* A Shopee nomeia os mesmos estados com outras palavras. "UNLIST" é o
   anúncio tirado da vitrine pelo próprio vendedor — o equivalente exato do
   "paused" do Mercado Livre. "BANNED" é remoção pela plataforma, que aqui se
   lê como encerrado, e não como "em revisão": o ML devolve `under_review`
   enquanto ainda dá pra corrigir, e a Shopee não tem esse meio-termo neste
   campo. Sem esta tradução, produto que só vive na Shopee caía em
   "não consultado" mesmo com o status coletado. */
const STATUS_SHOPEE: Record<string, StatusAnuncioParado> = {
  NORMAL: "ativo",
  UNLIST: "pausado",
  BANNED: "encerrado",
  DELETED: "encerrado",
};

const MOTIVO_STATUS_SHOPEE: Record<string, string> = {
  UNLIST: "fora da vitrine na Shopee",
  BANNED: "removido pela Shopee",
  DELETED: "excluído",
};

function traduzirStatusAnuncio(status: { status: string; subStatus: string | null; canal?: string }): { statusAnuncio: StatusAnuncioParado; motivoStatus: string | null } {
  if (status.canal === "shopee") {
    const traduzido = STATUS_SHOPEE[status.status.toUpperCase()];
    return traduzido
      ? { statusAnuncio: traduzido, motivoStatus: MOTIVO_STATUS_SHOPEE[status.status.toUpperCase()] ?? null }
      // Status novo que a Shopee passe a devolver não vira palpite: fica como
      // não consultado, que é a única coisa verdadeira a dizer.
      : { statusAnuncio: "nao_consultado", motivoStatus: null };
  }
  const motivo = status.subStatus ? (SUB_STATUS_LABEL[status.subStatus] ?? status.subStatus) : null;
  if (status.status === "active") return { statusAnuncio: "ativo", motivoStatus: motivo };
  if (status.status === "paused") return { statusAnuncio: "pausado", motivoStatus: motivo };
  // under_review é moderação — o anúncio pode voltar a ficar ativo assim que
  // o problema for corrigido. Diferente de "closed"/não encontrado, que são
  // definitivos: confirmado na documentação oficial do ML, não é o mesmo
  // status e não pode virar o mesmo selo.
  if (status.status === "under_review") return { statusAnuncio: "em_revisao", motivoStatus: motivo };
  if (status.status === "closed" || status.status === "nao_encontrado") {
    return { statusAnuncio: "encerrado", motivoStatus: motivo };
  }
  return { statusAnuncio: "nao_consultado", motivoStatus: motivo };
}

/** Preenche `statusAnuncio`/`motivoStatus` com a última coleta da A5, sem
 *  chamar o Mercado Livre no caminho dos filtros. Recebe a união das quatro
 *  listas do mosaico para resolver tudo em uma única consulta local. */
async function enriquecerComStatusAnuncio(
  ctx: CrudContext,
  itens: Array<{ produtoId: string; statusAnuncio: StatusAnuncioParado; motivoStatus: string | null }>,
): Promise<void> {
  if (itens.length === 0) return;

  /* Sem travar em "mercadolivre": o mesmo produto pode viver só na Shopee, e
     ali o status ficava vazio — a tela dizia "sem vínculo", que é diferente
     de "não sei" e diferente de "está pausado lá". Lê a coluna de canal
     (`status_anuncio`), preenchida pela A5 nos dois canais. */
  const vinculos = await ctx.db
    .select({
      produtoId: produtoCanal.produtoId,
      status: produtoCanal.statusAnuncio,
      subStatus: produtoCanal.mlSubStatus,
      canal: channelAccount.tipo,
    })
    .from(produtoCanal)
    .innerJoin(channelAccount, eq(channelAccount.id, produtoCanal.channelAccountId))
    .where(and(
      eq(produtoCanal.orgId, ctx.orgId),
      eq(produtoCanal.ativo, true),
      inArray(produtoCanal.produtoId, itens.map((item) => item.produtoId)),
    ));

  /* Produto anunciado nos dois canais tem duas linhas. Fica com a que tem
     status coletado; havendo as duas, o Mercado Livre decide, porque é onde
     a régua de "encerrado" já é verificada de hora em hora. */
  const statusPorProduto = new Map<string, typeof vinculos[number]>();
  for (const vinculo of vinculos) {
    const atual = statusPorProduto.get(vinculo.produtoId);
    if (!atual) { statusPorProduto.set(vinculo.produtoId, vinculo); continue; }
    if (!atual.status && vinculo.status) { statusPorProduto.set(vinculo.produtoId, vinculo); continue; }
    if (vinculo.status && vinculo.canal === "mercadolivre") statusPorProduto.set(vinculo.produtoId, vinculo);
  }

  for (const item of itens) {
    const vinculo = statusPorProduto.get(item.produtoId);
    if (!vinculo) { item.statusAnuncio = "sem_vinculo"; continue; }
    if (!vinculo.status) continue; // A5 ainda não coletou: mantém "nao_consultado".
    const { statusAnuncio, motivoStatus } = traduzirStatusAnuncio({
      status: vinculo.status,
      subStatus: vinculo.subStatus,
      canal: vinculo.canal,
    });
    item.statusAnuncio = statusAnuncio;
    item.motivoStatus = motivoStatus;
  }
}

export async function obterDashboardData(
  ctx: CrudContext,
  filters?: DashboardFilters,
): Promise<DashboardData> {
  const agora = new Date();
  const { granularidade, brandIds: brandFiltro, canais: canalFiltro } = normalizarFiltros(filters);

  // Período personalizado: as duas pontas vêm do usuário (input type=date, sem
  // hora) e substituem a janela fixa da granularidade. A série sempre baldeia
  // por dia aqui — semana/mês não fazem sentido num recorte arbitrário curto.
  const periodoInicio = filters?.inicio ? parseDataLocal(filters.inicio) : null;
  const periodoFim = filters?.fim ? parseDataLocal(filters.fim, true) : null;
  const personalizado = periodoInicio !== null && periodoFim !== null;

  const fimJanela = personalizado ? periodoFim! : agora;
  const janelaDias = personalizado
    ? Math.max(1, differenceInCalendarDays(fimJanela, periodoInicio!) + 1)
    : JANELA_DIAS[granularidade];
  const inicioJanela = personalizado ? periodoInicio! : subDays(agora, janelaDias);

  // Comparativo: período anterior, de mesmo tamanho, imediatamente antes do atual.
  const inicioJanelaAnterior = subDays(inicioJanela, janelaDias);
  const fimJanelaAnterior = inicioJanela;

  // "Hoje" (1 dia só) baldeado por dia dá 1 ponto — sem 2 pontos não dá
  // pra desenhar uma linha de tendência de verdade. Por hora usa os
  // `pedido.createdAt` reais do próprio dia (ver montarBaldesHora): mais
  // fino que o normal, mas ainda dado real, nunca inventado.
  const serieHoraria = personalizado && janelaDias === 1;
  const granularidadeSerie: Granularidade = personalizado ? "dia" : granularidade;
  const pontosSerie = personalizado ? Math.min(janelaDias, 60) : PONTOS_SERIE[granularidade];
  const inicioSerie = serieHoraria
    ? inicioJanela
    : inicioDoBalde(recuarBaldes(fimJanela, granularidadeSerie, pontosSerie - 1), granularidadeSerie);
  // A série pode olhar mais para trás que a janela de produto (12 meses vs 365 dias
  // batem, mas 12 semanas < 84 dias não). Busca pedidos desde o que for mais antigo.
  const inicioBusca = inicioSerie < inicioJanelaAnterior ? inicioSerie : inicioJanelaAnterior;
  const fimBusca = fimJanela;

  const limiteParado = subDays(agora, DIAS_PARA_PARADO);

  const condicoesPedido = [
    eq(pedido.orgId, ctx.orgId),
    gte(dataVendaPedidoSql(), inicioBusca.toISOString()),
    pedidoComercialSql(),
    // Cancelado e devolvido não são faturamento nem venda de produto.
    inArray(pedido.status, [...STATUS_PEDIDO_FATURAVEL]),
  ];
  if (personalizado) condicoesPedido.push(lte(dataVendaPedidoSql(), fimBusca.toISOString()));
  if (brandFiltro.length > 0) condicoesPedido.push(inArray(pedido.brandId, brandFiltro));
  if (canalFiltro.length > 0) condicoesPedido.push(inArray(pedido.canal, canalFiltro));

  // Trilha independente da consulta de faturamento. Ela não afrouxa o filtro
  // usado pelo número legado, pelo líquido nem pelas listas de produtos; só
  // mede a parcela excluída para explicar a diferença para o total bruto.
  const condicoesPedidosExcluidos = [
    eq(pedido.orgId, ctx.orgId),
    gte(dataVendaPedidoSql(), inicioJanela.toISOString()),
    pedidoComercialSql(),
    inArray(pedido.status, ["cancelado", "devolvido"]),
    pagamentoAprovadoPedidoSql(),
  ];
  if (personalizado) condicoesPedidosExcluidos.push(lte(dataVendaPedidoSql(), fimBusca.toISOString()));
  if (brandFiltro.length > 0) condicoesPedidosExcluidos.push(inArray(pedido.brandId, brandFiltro));
  if (canalFiltro.length > 0) condicoesPedidosExcluidos.push(inArray(pedido.canal, canalFiltro));

  const condicoesProduto = [
    eq(produto.orgId, ctx.orgId),
    eq(produto.ativo, true),
    isNull(produto.deletedAt),
  ];
  if (brandFiltro.length > 0) condicoesProduto.push(inArray(produto.brandId, brandFiltro));
  if (canalFiltro.length > 0) condicoesProduto.push(condicaoCanalProduto(ctx.orgId, canalFiltro));

  const [pedidosJanela, taxasPorPedido, itensVendidos, produtosAtivos, ultimasSaidas, [pedidosExcluidos]] = await Promise.all([
    ctx.db
      .select({
        id: pedido.id,
        total: pedido.total,
        frete: pedido.frete,
        valorLiquido: pedido.valorLiquido,
        dadosOrigem: pedido.dadosOrigem,
        createdAt: dataVendaPedidoSql(),
      })
      .from(pedido)
      .where(and(...condicoesPedido)),
    // Soma da taxa de marketplace por pedido, na mesma janela de busca dos
    // pedidos acima. Só entra em cena no fallback: pedido cujo canal informou
    // o repasse real usa `valor_liquido` e ignora esta soma.
    ctx.db
      .select({
        pedidoId: pedidoItem.pedidoId,
        taxa: sql<string>`coalesce(sum(${pedidoItem.taxaMarketplace}), 0)`,
      })
      .from(pedidoItem)
      .innerJoin(pedido, eq(pedido.id, pedidoItem.pedidoId))
      .where(and(...condicoesPedido))
      .groupBy(pedidoItem.pedidoId),
    ctx.db
      .select({
        produtoId: pedidoItem.produtoId,
        quantidade: pedidoItem.quantidade,
        precoUnitario: pedidoItem.precoUnitario,
        pedidoEm: dataVendaPedidoSql(),
      })
      .from(pedidoItem)
      .innerJoin(pedido, eq(pedido.id, pedidoItem.pedidoId))
      // Traz também a janela anterior: o ranking continua sendo montado com
      // a janela atual, mas a quantidade anterior permite que o card mostre
      // uma variação real do mesmo produto em vez do antigo +11% fictício.
      .where(and(...condicoesPedido, gte(dataVendaPedidoSql(), inicioJanelaAnterior.toISOString()))),
    ctx.db
      .select({
        id: produto.id,
        sku: produto.sku,
        nome: produto.nome,
        preco: produto.preco,
        estoqueMinimo: produto.estoqueMinimo,
        // Null é deliberado: sem leitura recente, o produto não pode virar
        // reposição/encalhe como se o último saldo conhecido ainda fosse atual.
        saldo: saldoPublicadoAtual(ctx.orgId, canalFiltro),
        marca: brand.slug,
      })
      .from(produto)
      .innerJoin(brand, eq(brand.id, produto.brandId))
      .where(and(...condicoesProduto)),
    ctx.db
      .select({ produtoId: pedidoItem.produtoId, ultima: max(pedido.createdAt) })
      .from(pedidoItem)
      .innerJoin(pedido, eq(pedido.id, pedidoItem.pedidoId))
      .where(and(eq(pedido.orgId, ctx.orgId), inArray(pedido.status, [...STATUS_PEDIDO_FATURAVEL])))
      .groupBy(pedidoItem.produtoId),
    ctx.db
      .select({
        cancelados: sql<string>`coalesce(sum(${pedido.total}) filter (where ${pedido.status} = 'cancelado'), 0)`,
        devolvidos: sql<string>`coalesce(sum(${pedido.total}) filter (where ${pedido.status} = 'devolvido'), 0)`,
        canceladosQtd: sql<number>`count(*) filter (where ${pedido.status} = 'cancelado')`,
        devolvidosQtd: sql<number>`count(*) filter (where ${pedido.status} = 'devolvido')`,
      })
      .from(pedido)
      .where(and(...condicoesPedidosExcluidos)),
  ]);

  /* ── Faturamento ── */
  // `fimJanela` de um dia inteiro é 23:59:59 — pra "hoje" isso projeta a
  // série até o fim do dia, com todas as horas futuras em zero. Corta em
  // `agora` pra série terminar na última hora que de fato existiu.
  const baldes = serieHoraria
    ? montarBaldesHora(inicioJanela, fimJanela > agora ? agora : fimJanela)
    : montarBaldes(fimJanela, granularidadeSerie, personalizado ? pontosSerie : undefined);
  const baldesLiquido = serieHoraria
    ? montarBaldesHora(inicioJanela, fimJanela > agora ? agora : fimJanela)
    : montarBaldes(fimJanela, granularidadeSerie, personalizado ? pontosSerie : undefined);
  const taxaPorPedido = new Map(taxasPorPedido.map((t) => [t.pedidoId, parseMoney(t.taxa)]));
  let totalJanela = 0;
  let pedidosNaJanela = 0;
  let totalJanelaAnterior = 0;
  let totalJanelaLiquido = 0;
  let totalJanelaAnteriorLiquido = 0;
  let reembolsosParciaisJanela = 0;
  let pedidosComReembolsoParcialQtd = 0;

  for (const item of pedidosJanela) {
    const reembolsoParcial = reembolsoParcialInformado(item.dadosOrigem);
    const valor = valorFaturavelPedido(item.total, item.dadosOrigem);
    const liquido = liquidoDoPedido({
      total: valor,
      frete: parseMoney(item.frete),
      valorLiquido: item.valorLiquido,
      taxasConhecidas: taxaPorPedido.get(item.id) ?? 0,
    });
    const chave = (serieHoraria ? startOfHour(item.createdAt) : inicioDoBalde(item.createdAt, granularidadeSerie)).getTime();
    if (baldes.has(chave)) baldes.set(chave, (baldes.get(chave) ?? 0) + valor);
    if (baldesLiquido.has(chave)) baldesLiquido.set(chave, (baldesLiquido.get(chave) ?? 0) + liquido);

    if (item.createdAt >= inicioJanela && item.createdAt <= fimJanela) {
      totalJanela += valor;
      totalJanelaLiquido += liquido;
      pedidosNaJanela += 1;
      reembolsosParciaisJanela += reembolsoParcial;
      if (reembolsoParcial > 0) pedidosComReembolsoParcialQtd += 1;
    }
    // A fronteira é exclusiva: um pedido exatamente à meia-noite do início
    // atual pertence ao período atual, nunca aos dois períodos.
    if (item.createdAt >= inicioJanelaAnterior && item.createdAt < fimJanelaAnterior) {
      totalJanelaAnterior += valor;
      totalJanelaAnteriorLiquido += liquido;
    }
  }

  const valoresSerie = [...baldes.values()];
  const maiorValor = Math.max(...valoresSerie, 0);
  const serie: SeriePonto[] = [...baldes.entries()].map(([chave, valor]) => ({
    label: serieHoraria ? `${horaCurta.format(new Date(chave))}h` : rotuloDoBalde(new Date(chave), granularidadeSerie),
    valor,
    altura: maiorValor > 0 ? Math.max(2, Math.round((valor / maiorValor) * 100)) : 0,
  }));

  const valoresSerieLiquido = [...baldesLiquido.values()];
  const maiorValorLiquido = Math.max(...valoresSerieLiquido, 0);
  const serieLiquido: SeriePonto[] = [...baldesLiquido.entries()].map(([chave, valor]) => ({
    label: serieHoraria ? `${horaCurta.format(new Date(chave))}h` : rotuloDoBalde(new Date(chave), granularidadeSerie),
    valor,
    altura: maiorValorLiquido > 0 ? Math.max(2, Math.round((valor / maiorValorLiquido) * 100)) : 0,
  }));

  const composicaoCalculada = calcularComposicaoFaturamento(
    totalJanela,
    parseMoney(pedidosExcluidos?.cancelados),
    parseMoney(pedidosExcluidos?.devolvidos),
    reembolsosParciaisJanela,
  );
  // Kill switch exclusivamente no servidor. `false` restaura o contrato
  // visual anterior sem desfazer deploy nem tocar em dados persistidos.
  const composicaoAtiva = process.env.METRICAS_FINANCEIRAS_V2 !== "false";

  const faturamento: FaturamentoResumo = {
    granularidade,
    total: formatCurrency(totalJanela),
    totalNumerico: totalJanela,
    variacaoPercentual: totalJanelaAnterior > 0
      ? Math.round(((totalJanela - totalJanelaAnterior) / totalJanelaAnterior) * 100)
      : null,
    totalAnteriorNumerico: totalJanelaAnterior,
    totalAnterior: formatCurrency(totalJanelaAnterior),
    janelaAnteriorLabel: `${diaMesAno.format(inicioJanelaAnterior)} – ${diaMesAno.format(subDays(fimJanelaAnterior, 1))}`,
    pedidos: pedidosNaJanela,
    ticketMedio: formatCurrency(pedidosNaJanela > 0 ? totalJanela / pedidosNaJanela : 0),
    serie,
    janelaLabel: personalizado
      ? `${diaMesAno.format(inicioJanela)} – ${diaMesAno.format(fimJanela)}`
      : GRANULARIDADE_LABEL[granularidade],
    totalLiquidoNumerico: totalJanelaLiquido,
    totalLiquido: formatCurrency(totalJanelaLiquido),
    totalAnteriorLiquidoNumerico: totalJanelaAnteriorLiquido,
    totalAnteriorLiquido: formatCurrency(totalJanelaAnteriorLiquido),
    variacaoPercentualLiquido: totalJanelaAnteriorLiquido > 0
      ? Math.round(((totalJanelaLiquido - totalJanelaAnteriorLiquido) / totalJanelaAnteriorLiquido) * 100)
      : null,
    ticketMedioLiquido: formatCurrency(pedidosNaJanela > 0 ? totalJanelaLiquido / pedidosNaJanela : 0),
    serieLiquido,
    ...(composicaoAtiva ? {
      composicao: {
        pedidosBrutosNumerico: composicaoCalculada.pedidosBrutosNumerico,
        pedidosBrutos: formatCurrency(composicaoCalculada.pedidosBrutosNumerico),
        pedidosBrutosQtd: pedidosNaJanela
          + Number(pedidosExcluidos?.canceladosQtd ?? 0)
          + Number(pedidosExcluidos?.devolvidosQtd ?? 0),
        canceladosDevolvidosNumerico: composicaoCalculada.canceladosDevolvidosNumerico,
        canceladosDevolvidos: formatCurrency(composicaoCalculada.canceladosDevolvidosNumerico),
        canceladosDevolvidosQtd: Number(pedidosExcluidos?.canceladosQtd ?? 0)
          + Number(pedidosExcluidos?.devolvidosQtd ?? 0),
        reembolsosParciaisNumerico: composicaoCalculada.reembolsosParciaisNumerico,
        reembolsosParciais: formatCurrency(composicaoCalculada.reembolsosParciaisNumerico),
        pedidosComReembolsoParcialQtd,
      },
    } : {}),
  };

  /* ── Agregação de vendas por produto ── */
  const vendasPorProduto = new Map<string, { quantidade: number; receita: number }>();
  const vendasAnterioresPorProduto = new Map<string, { quantidade: number; receita: number }>();
  for (const item of itensVendidos) {
    const pertenceAoAtual = item.pedidoEm >= inicioJanela && item.pedidoEm <= fimJanela;
    const alvo = pertenceAoAtual ? vendasPorProduto : vendasAnterioresPorProduto;
    const atual = alvo.get(item.produtoId) ?? { quantidade: 0, receita: 0 };
    atual.quantidade += item.quantidade;
    atual.receita += item.quantidade * parseMoney(item.precoUnitario);
    alvo.set(item.produtoId, atual);
  }

  const ultimaSaidaPorProduto = new Map<string, Date>();
  for (const item of ultimasSaidas) {
    if (item.ultima) ultimaSaidaPorProduto.set(item.produtoId, item.ultima);
  }

  const base = (item: typeof produtosAtivos[number]): ProdutoBase => ({
    produtoId: item.id,
    sku: item.sku,
    nome: item.nome,
    marca: item.marca,
    marcaLabel: brandLabel(item.marca),
  });

  /** Capital imobilizado: preço de venda × saldo. */
  const valorUnitario = (item: typeof produtosAtivos[number]): number => parseMoney(item.preco);

  /* ── 1. Produtos que vendem mais ── */
  const rankingVendasCompleto = produtosAtivos
    .map((item) => ({ item, venda: vendasPorProduto.get(item.id) }))
    .filter((linha): linha is { item: typeof produtosAtivos[number]; venda: { quantidade: number; receita: number } } =>
      Boolean(linha.venda && linha.venda.quantidade > 0))
    .sort((a, b) => b.venda.quantidade - a.venda.quantidade || b.venda.receita - a.venda.receita);

  const maiorQuantidade = rankingVendasCompleto[0]?.venda.quantidade ?? 0;
  const maisVendidos: ProdutoMaisVendido[] = rankingVendasCompleto.slice(0, LIMITE_ITENS_LISTA).map(({ item, venda }) => ({
    ...base(item),
    quantidade: venda.quantidade,
    quantidadeAnterior: vendasAnterioresPorProduto.get(item.id)?.quantidade ?? 0,
    variacaoPercentual: (() => {
      const anterior = vendasAnterioresPorProduto.get(item.id)?.quantidade ?? 0;
      return anterior > 0 ? Math.round(((venda.quantidade - anterior) / anterior) * 100) : null;
    })(),
    receita: formatCurrency(venda.receita),
    participacao: maiorQuantidade > 0 ? Math.round((venda.quantidade / maiorQuantidade) * 100) : 0,
    statusAnuncio: "nao_consultado" as StatusAnuncioParado,
    motivoStatus: null as string | null,
  }));

  /* ── 2. Produtos que não vendem (giro baixo) ──
     Menos de 10 vendas por semana — a régua é semanal, então o limite usado
     aqui escala com o tamanho da janela em análise (30/84/365 dias, ou o
     período personalizado), em vez de comparar sempre contra um total fixo
     de 10 independente de a janela ser curta ou longa. */
  const limiteGiroBaixo = (LIMITE_GIRO_BAIXO_POR_SEMANA / 7) * janelaDias;
  const giroBaixoCompleto = produtosAtivos
    .filter((item) => (item.saldo ?? 0) > 0)
    .map((item) => ({ item, quantidade: vendasPorProduto.get(item.id)?.quantidade ?? 0 }))
    // Giro baixo ainda vende. Quantidade zero pertence exclusivamente a
    // Estoque parado, evitando o mesmo produto nos dois cards.
    .filter(({ item, quantidade }) => {
      const ultimaSaida = ultimaSaidaPorProduto.get(item.id);
      return quantidade > 0
        && quantidade < limiteGiroBaixo
        && ultimaSaida !== undefined
        && ultimaSaida >= limiteParado;
    })
    .map(({ item, quantidade }) => ({
      ...base(item),
      quantidade,
      saldo: item.saldo ?? 0,
      valorParadoNumerico: (item.saldo ?? 0) * valorUnitario(item),
    }))
    // Menor giro primeiro; empate desempata por dinheiro parado — o que dói mais.
    .sort((a, b) => a.quantidade - b.quantidade || b.valorParadoNumerico - a.valorParadoNumerico);
  const giroBaixoValorParadoNumerico = giroBaixoCompleto.reduce((soma, item) => soma + item.valorParadoNumerico, 0);
  const giroBaixo: ProdutoGiroBaixo[] = giroBaixoCompleto.slice(0, LIMITE_ITENS_LISTA).map(({ valorParadoNumerico, ...resto }) => ({
      ...resto,
      valorParado: formatCurrency(valorParadoNumerico),
      statusAnuncio: "nao_consultado" as StatusAnuncioParado,
      motivoStatus: null as string | null,
    }));

  /* ── 3. Produtos que não saem (estoque parado) ── */
  const paradosCompletos = produtosAtivos
    .filter((item) => (item.saldo ?? 0) > 0)
    .map((item) => {
      const ultimaSaida = ultimaSaidaPorProduto.get(item.id) ?? null;
      return { item, ultimaSaida };
    })
    .filter(({ ultimaSaida }) => ultimaSaida === null || ultimaSaida < limiteParado)
    .map(({ item, ultimaSaida }) => ({
      ...base(item),
      saldo: item.saldo ?? 0,
      diasParado: ultimaSaida
        ? Math.floor((agora.getTime() - ultimaSaida.getTime()) / 86_400_000)
        : null,
      valorParadoNumerico: (item.saldo ?? 0) * valorUnitario(item),
    }))
    // Maior capital imobilizado primeiro — é o que justifica liquidar.
    .sort((a, b) => b.valorParadoNumerico - a.valorParadoNumerico);
  const paradosValorParadoNumerico = paradosCompletos.reduce((soma, item) => soma + item.valorParadoNumerico, 0);
  const parados: ProdutoParado[] = paradosCompletos.slice(0, LIMITE_ITENS_LISTA).map(({ valorParadoNumerico, ...resto }) => ({
      ...resto,
      valorParado: formatCurrency(valorParadoNumerico),
      statusAnuncio: "nao_consultado" as StatusAnuncioParado,
      motivoStatus: null as string | null,
    }));

  /* ── 4. Reposição (bateu o mínimo, repor em breve) ── */
  const reposicaoCompleta = produtosAtivos
    .filter((item) => {
      const saldo = item.saldo ?? 0;
      const minimo = item.estoqueMinimo;
      // Sem mínimo cadastrado não há régua para avisar.
      if (minimo <= 0) return false;
      // Bateu (ou já ficou abaixo d)o mínimo: é exatamente o gatilho do aviso.
      return saldo > 0 && saldo <= minimo;
    })
    .map((item) => {
      const saldo = item.saldo ?? 0;
      const minimo = item.estoqueMinimo;
      const vendidoNaJanela = vendasPorProduto.get(item.id)?.quantidade ?? 0;
      const consumoDiario = vendidoNaJanela / janelaDias;
      return {
        ...base(item),
        saldo,
        minimo,
        coberturaDias: consumoDiario > 0 ? Math.floor(saldo / consumoDiario) : null,
        // 100 = zerado; 0 = encostando no mínimo por cima.
        urgencia: minimo > 0 ? Math.round(((minimo - saldo) / minimo) * 100) : 100,
        statusAnuncio: "nao_consultado" as StatusAnuncioParado,
        motivoStatus: null as string | null,
      };
    })
    // Quem tem menos dias de estoque primeiro; sem histórico, quem está mais perto do mínimo.
    .sort((a, b) => {
      if (a.coberturaDias !== null && b.coberturaDias !== null) return a.coberturaDias - b.coberturaDias;
      if (a.coberturaDias !== null) return -1;
      if (b.coberturaDias !== null) return 1;
      return b.urgencia - a.urgencia;
    });
  const reposicao = reposicaoCompleta.slice(0, LIMITE_ITENS_LISTA);

  // Uma leitura local para as quatro listas. Produtos repetidos entre cards
  // não geram trabalho extra relevante e cada objeto recebe o mesmo snapshot.
  await enriquecerComStatusAnuncio(ctx, [
    ...maisVendidos,
    ...giroBaixo,
    ...parados,
    ...reposicao,
  ]);

  return {
    faturamento,
    maisVendidos,
    maisVendidosTotal: rankingVendasCompleto.length,
    giroBaixo,
    giroBaixoTotal: giroBaixoCompleto.length,
    giroBaixoValorParadoNumerico,
    giroBaixoValorParado: formatCurrency(giroBaixoValorParadoNumerico),
    parados,
    paradosTotal: paradosCompletos.length,
    paradosValorParadoNumerico,
    paradosValorParado: formatCurrency(paradosValorParadoNumerico),
    reposicao,
    reposicaoTotal: reposicaoCompleta.length,
  };
}
