import { and, eq, gte, inArray, isNull, lte, max, ne, notInArray, sql } from "drizzle-orm";
import { differenceInCalendarDays, startOfDay, startOfHour, startOfMonth, startOfWeek, subDays, subMonths, subWeeks } from "date-fns";
import type { CrudContext } from "@/shared/lib/crud-factory";
import {
  brand,
  channelAccount,
  estoqueCanalSaldo,
  pedido,
  pedidoItem,
  produto,
  produtoCanal,
} from "@/shared/lib/db/schema";
import { getBrandConfig, isBrandSlug } from "@/shared/config/brands";
import { criarMLProvider } from "@/modules/canais/infrastructure/mercadolivre.provider";
import type { MLStatusAnuncio } from "@/modules/canais/infrastructure/mercadolivre.provider";

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
const TAMANHO_LISTA = 6;

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
  giroBaixo: ProdutoGiroBaixo[];
  parados: ProdutoParado[];
  reposicao: ProdutoReposicao[];
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

function traduzirStatusAnuncio(status: MLStatusAnuncio): { statusAnuncio: StatusAnuncioParado; motivoStatus: string | null } {
  const motivo = status.subStatus[0] ? (SUB_STATUS_LABEL[status.subStatus[0]] ?? status.subStatus[0]) : null;
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

/** Preenche `statusAnuncio`/`motivoStatus` ao vivo, consultando o Mercado
 *  Livre — reaproveitado por qualquer lista de produtos que precise mostrar
 *  se o anúncio por trás do número ainda está ativo (Estoque Parado, Repor
 *  em breve, ...). Só chama a API para os itens que a lista de fato mostra
 *  (já vem cortada por TAMANHO_LISTA antes de chegar aqui), nunca para o
 *  catálogo inteiro. Muta os itens em vez de retornar uma cópia — o
 *  chamador já criou o array só pra isso. */
async function enriquecerComStatusAnuncio(
  ctx: CrudContext,
  itens: Array<{ produtoId: string; statusAnuncio: StatusAnuncioParado; motivoStatus: string | null }>,
): Promise<void> {
  if (itens.length === 0) return;

  const vinculos = await ctx.db
    .select({
      produtoId: produtoCanal.produtoId,
      externalListingId: produtoCanal.externalListingId,
      marca: brand.slug,
    })
    .from(produtoCanal)
    .innerJoin(channelAccount, eq(channelAccount.id, produtoCanal.channelAccountId))
    .innerJoin(brand, eq(brand.id, channelAccount.brandId))
    .where(and(
      eq(produtoCanal.orgId, ctx.orgId),
      eq(channelAccount.tipo, "mercadolivre"),
      inArray(produtoCanal.produtoId, itens.map((item) => item.produtoId)),
    ));

  const listingPorProduto = new Map(vinculos.map((v) => [v.produtoId, v]));
  const idsPorMarca = new Map<string, string[]>();
  for (const v of vinculos) {
    if (!isBrandSlug(v.marca)) continue;
    idsPorMarca.set(v.marca, [...(idsPorMarca.get(v.marca) ?? []), v.externalListingId]);
  }

  const statusPorListing = new Map<string, MLStatusAnuncio>();
  await Promise.all([...idsPorMarca].map(async ([marca, ids]) => {
    try {
      const provider = await criarMLProvider(marca as Parameters<typeof criarMLProvider>[0]);
      const resultado = await provider.consultarStatusAnuncios([...new Set(ids)]);
      for (const [id, info] of Object.entries(resultado)) statusPorListing.set(id, info);
    } catch {
      // Falha de rede/token não pode derrubar o card inteiro — os itens
      // dessa marca simplesmente ficam "não consultado" (fallback já setado pelo chamador).
    }
  }));

  for (const item of itens) {
    const vinculo = listingPorProduto.get(item.produtoId);
    if (!vinculo) { item.statusAnuncio = "sem_vinculo"; continue; }
    const status = statusPorListing.get(vinculo.externalListingId);
    if (!status) continue; // consulta falhou: mantém "nao_consultado"
    const { statusAnuncio, motivoStatus } = traduzirStatusAnuncio(status);
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
    gte(pedido.createdAt, inicioBusca),
    // Cancelado e devolvido não são faturamento nem venda de produto.
    ne(pedido.status, "cancelado"),
    ne(pedido.status, "devolvido"),
  ];
  if (personalizado) condicoesPedido.push(lte(pedido.createdAt, fimBusca));
  if (brandFiltro.length > 0) condicoesPedido.push(inArray(pedido.brandId, brandFiltro));
  if (canalFiltro.length > 0) condicoesPedido.push(inArray(pedido.canal, canalFiltro));

  const condicoesProduto = [
    eq(produto.orgId, ctx.orgId),
    eq(produto.ativo, true),
    isNull(produto.deletedAt),
  ];
  if (brandFiltro.length > 0) condicoesProduto.push(inArray(produto.brandId, brandFiltro));
  if (canalFiltro.length > 0) condicoesProduto.push(condicaoCanalProduto(ctx.orgId, canalFiltro));

  const [pedidosJanela, itensVendidos, produtosAtivos, ultimasSaidas] = await Promise.all([
    ctx.db
      .select({ id: pedido.id, total: pedido.total, createdAt: pedido.createdAt })
      .from(pedido)
      .where(and(...condicoesPedido)),
    ctx.db
      .select({
        produtoId: pedidoItem.produtoId,
        quantidade: pedidoItem.quantidade,
        precoUnitario: pedidoItem.precoUnitario,
        pedidoEm: pedido.createdAt,
      })
      .from(pedidoItem)
      .innerJoin(pedido, eq(pedido.id, pedidoItem.pedidoId))
      .where(and(...condicoesPedido, gte(pedido.createdAt, inicioJanela))),
    ctx.db
      .select({
        id: produto.id,
        sku: produto.sku,
        nome: produto.nome,
        preco: produto.preco,
        estoqueMinimo: produto.estoqueMinimo,
        saldo: sql<number>`coalesce((select max(${estoqueCanalSaldo.saldo}) from ${estoqueCanalSaldo} where ${estoqueCanalSaldo.produtoId} = ${produto.id} and ${estoqueCanalSaldo.orgId} = ${ctx.orgId}), 0)`,
        marca: brand.slug,
      })
      .from(produto)
      .innerJoin(brand, eq(brand.id, produto.brandId))
      .where(and(...condicoesProduto)),
    ctx.db
      .select({ produtoId: pedidoItem.produtoId, ultima: max(pedido.createdAt) })
      .from(pedidoItem)
      .innerJoin(pedido, eq(pedido.id, pedidoItem.pedidoId))
      .where(and(eq(pedido.orgId, ctx.orgId), notInArray(pedido.status, ["cancelado", "devolvido"])))
      .groupBy(pedidoItem.produtoId),
  ]);

  /* ── Faturamento ── */
  // `fimJanela` de um dia inteiro é 23:59:59 — pra "hoje" isso projeta a
  // série até o fim do dia, com todas as horas futuras em zero. Corta em
  // `agora` pra série terminar na última hora que de fato existiu.
  const baldes = serieHoraria
    ? montarBaldesHora(inicioJanela, fimJanela > agora ? agora : fimJanela)
    : montarBaldes(fimJanela, granularidadeSerie, personalizado ? pontosSerie : undefined);
  let totalJanela = 0;
  let pedidosNaJanela = 0;
  let totalJanelaAnterior = 0;

  for (const item of pedidosJanela) {
    const valor = parseMoney(item.total);
    const chave = (serieHoraria ? startOfHour(item.createdAt) : inicioDoBalde(item.createdAt, granularidadeSerie)).getTime();
    if (baldes.has(chave)) baldes.set(chave, (baldes.get(chave) ?? 0) + valor);

    if (item.createdAt >= inicioJanela && item.createdAt <= fimJanela) {
      totalJanela += valor;
      pedidosNaJanela += 1;
    }
    if (item.createdAt >= inicioJanelaAnterior && item.createdAt <= fimJanelaAnterior) {
      totalJanelaAnterior += valor;
    }
  }

  const valoresSerie = [...baldes.values()];
  const maiorValor = Math.max(...valoresSerie, 0);
  const serie: SeriePonto[] = [...baldes.entries()].map(([chave, valor]) => ({
    label: serieHoraria ? `${horaCurta.format(new Date(chave))}h` : rotuloDoBalde(new Date(chave), granularidadeSerie),
    valor,
    altura: maiorValor > 0 ? Math.max(2, Math.round((valor / maiorValor) * 100)) : 0,
  }));

  const faturamento: FaturamentoResumo = {
    granularidade,
    total: formatCurrency(totalJanela),
    totalNumerico: totalJanela,
    variacaoPercentual: totalJanelaAnterior > 0
      ? Math.round(((totalJanela - totalJanelaAnterior) / totalJanelaAnterior) * 100)
      : null,
    totalAnteriorNumerico: totalJanelaAnterior,
    totalAnterior: formatCurrency(totalJanelaAnterior),
    janelaAnteriorLabel: `${diaMes.format(inicioJanelaAnterior)} – ${diaMes.format(subDays(fimJanelaAnterior, 1))}`,
    pedidos: pedidosNaJanela,
    ticketMedio: formatCurrency(pedidosNaJanela > 0 ? totalJanela / pedidosNaJanela : 0),
    serie,
    janelaLabel: personalizado
      ? `${diaMes.format(inicioJanela)} – ${diaMes.format(fimJanela)}`
      : GRANULARIDADE_LABEL[granularidade],
  };

  /* ── Agregação de vendas por produto ── */
  const vendasPorProduto = new Map<string, { quantidade: number; receita: number }>();
  for (const item of itensVendidos) {
    const atual = vendasPorProduto.get(item.produtoId) ?? { quantidade: 0, receita: 0 };
    atual.quantidade += item.quantidade;
    atual.receita += item.quantidade * parseMoney(item.precoUnitario);
    vendasPorProduto.set(item.produtoId, atual);
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
  const rankingVendas = produtosAtivos
    .map((item) => ({ item, venda: vendasPorProduto.get(item.id) }))
    .filter((linha): linha is { item: typeof produtosAtivos[number]; venda: { quantidade: number; receita: number } } =>
      Boolean(linha.venda && linha.venda.quantidade > 0))
    .sort((a, b) => b.venda.quantidade - a.venda.quantidade || b.venda.receita - a.venda.receita)
    .slice(0, TAMANHO_LISTA);

  const maiorQuantidade = rankingVendas[0]?.venda.quantidade ?? 0;
  const maisVendidos: ProdutoMaisVendido[] = rankingVendas.map(({ item, venda }) => ({
    ...base(item),
    quantidade: venda.quantidade,
    receita: formatCurrency(venda.receita),
    participacao: maiorQuantidade > 0 ? Math.round((venda.quantidade / maiorQuantidade) * 100) : 0,
    statusAnuncio: "nao_consultado" as StatusAnuncioParado,
    motivoStatus: null as string | null,
  }));

  // Um campeão de vendas com o anúncio pausado/em revisão é o caso mais
  // urgente dos 4 cards: é receita real que já estava entrando e parou.
  await enriquecerComStatusAnuncio(ctx, maisVendidos);

  /* ── 2. Produtos que não vendem (giro baixo) ──
     Menos de 10 vendas por semana — a régua é semanal, então o limite usado
     aqui escala com o tamanho da janela em análise (30/84/365 dias, ou o
     período personalizado), em vez de comparar sempre contra um total fixo
     de 10 independente de a janela ser curta ou longa. */
  const limiteGiroBaixo = (LIMITE_GIRO_BAIXO_POR_SEMANA / 7) * janelaDias;
  const giroBaixo: ProdutoGiroBaixo[] = produtosAtivos
    .filter((item) => (item.saldo ?? 0) > 0)
    .map((item) => ({ item, quantidade: vendasPorProduto.get(item.id)?.quantidade ?? 0 }))
    .filter(({ quantidade }) => quantidade < limiteGiroBaixo)
    .map(({ item, quantidade }) => ({
      ...base(item),
      quantidade,
      saldo: item.saldo ?? 0,
      valorParadoNumerico: (item.saldo ?? 0) * valorUnitario(item),
    }))
    // Menor giro primeiro; empate desempata por dinheiro parado — o que dói mais.
    .sort((a, b) => a.quantidade - b.quantidade || b.valorParadoNumerico - a.valorParadoNumerico)
    .slice(0, TAMANHO_LISTA)
    .map(({ valorParadoNumerico, ...resto }) => ({
      ...resto,
      valorParado: formatCurrency(valorParadoNumerico),
      statusAnuncio: "nao_consultado" as StatusAnuncioParado,
      motivoStatus: null as string | null,
    }));

  // Mesmo raciocínio de Estoque Parado: saber se o anúncio ainda está no ar
  // muda o que fazer com um produto que quase não vende — reativar antes de
  // decidir liquidar, por exemplo.
  await enriquecerComStatusAnuncio(ctx, giroBaixo);

  /* ── 3. Produtos que não saem (estoque parado) ── */
  const parados: ProdutoParado[] = produtosAtivos
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
    .sort((a, b) => b.valorParadoNumerico - a.valorParadoNumerico)
    .slice(0, TAMANHO_LISTA)
    .map(({ valorParadoNumerico, ...resto }) => ({
      ...resto,
      valorParado: formatCurrency(valorParadoNumerico),
      statusAnuncio: "nao_consultado" as StatusAnuncioParado,
      motivoStatus: null as string | null,
    }));

  // Status real do anúncio no ML — só para os poucos itens que a lista de
  // fato mostra (TAMANHO_LISTA), nunca para os 300+ que existem no banco.
  // Sem isso, "parado" parece sempre "ninguém compra" mesmo quando o próprio
  // vendedor pausou o anúncio (achado real ao auditar os dados de produção).
  await enriquecerComStatusAnuncio(ctx, parados);

  /* ── 4. Reposição (bateu o mínimo, repor em breve) ── */
  const reposicao: ProdutoReposicao[] = produtosAtivos
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
    })
    .slice(0, TAMANHO_LISTA);

  await enriquecerComStatusAnuncio(ctx, reposicao);

  return {
    faturamento,
    maisVendidos,
    giroBaixo,
    parados,
    reposicao,
  };
}
