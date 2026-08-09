import { and, eq, gte, isNull, max, ne } from "drizzle-orm";
import { startOfDay, startOfMonth, startOfWeek, subDays, subMonths, subWeeks } from "date-fns";
import type { CrudContext } from "@/shared/lib/crud-factory";
import {
  brand,
  estoqueMovimento,
  estoqueSaldo,
  pedido,
  pedidoItem,
  produto,
} from "@/shared/lib/db/schema";
import { getBrandConfig } from "@/shared/config/brands";

/* ── Parâmetros de negócio ───────────────────────────────────────
   Valores que definem o que conta como "atenção", "giro baixo" e
   "parado". Ficam nomeados aqui para serem discutíveis e ajustáveis
   sem caçar número mágico no meio de query. */

/** Zona de atenção de reposição: saldo acima do mínimo, mas até N× o mínimo.
 *  Avisa enquanto ainda dá tempo de repor — quem já bateu no mínimo passou do ponto. */
const FATOR_ZONA_ATENCAO = 2;

/** Vendas no período abaixo ou igual a isto contam como giro baixo. */
const LIMITE_GIRO_BAIXO = 2;

/** Dias sem nenhuma saída de estoque para o item ser considerado parado. */
const DIAS_PARA_PARADO = 90;

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
  brand?: string;
}

export interface DashboardFilterOption {
  value: string;
  label: string;
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
}

export interface ProdutoGiroBaixo extends ProdutoBase {
  quantidade: number;
  saldo: number;
  valorParado: string;
}

export interface ProdutoParado extends ProdutoBase {
  saldo: number;
  /** Dias desde a última saída. Null quando nunca teve saída registrada. */
  diasParado: number | null;
  valorParado: string;
}

export interface ProdutoReposicao extends ProdutoBase {
  saldo: number;
  minimo: number;
  /** Dias de estoque restantes no ritmo de venda atual. Null sem histórico de venda. */
  coberturaDias: number | null;
  /** Quão perto do mínimo está (0–100): 100 = encostando no mínimo. */
  urgencia: number;
}

export interface DashboardData {
  filtros: {
    granularidade: Granularidade;
    brand: string;
    brands: DashboardFilterOption[];
  };
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
function montarBaldes(agora: Date, granularidade: Granularidade): Map<number, number> {
  const total = PONTOS_SERIE[granularidade];
  const baldes = new Map<number, number>();
  for (let i = total - 1; i >= 0; i--) {
    const inicio = inicioDoBalde(recuarBaldes(agora, granularidade, i), granularidade);
    baldes.set(inicio.getTime(), 0);
  }
  return baldes;
}

/* ── Consulta principal ───────────────────────────────────────── */

function normalizarFiltros(filters?: DashboardFilters): Required<DashboardFilters> {
  const granularidade = filters?.granularidade;
  return {
    granularidade: granularidade && granularidade in JANELA_DIAS ? granularidade : "dia",
    brand: filters?.brand ?? "todas",
  };
}

export async function obterDashboardData(
  ctx: CrudContext,
  filters?: DashboardFilters,
): Promise<DashboardData> {
  const agora = new Date();
  const { granularidade, brand: brandFiltro } = normalizarFiltros(filters);
  const janelaDias = JANELA_DIAS[granularidade];
  const inicioJanela = subDays(agora, janelaDias);
  const inicioJanelaAnterior = subDays(agora, janelaDias * 2);
  const inicioSerie = inicioDoBalde(
    recuarBaldes(agora, granularidade, PONTOS_SERIE[granularidade] - 1),
    granularidade,
  );
  // A série pode olhar mais para trás que a janela de produto (12 meses vs 365 dias
  // batem, mas 12 semanas < 84 dias não). Busca pedidos desde o que for mais antigo.
  const inicioBusca = inicioSerie < inicioJanelaAnterior ? inicioSerie : inicioJanelaAnterior;

  const marcas = await ctx.db
    .select({ id: brand.id, name: brand.name, slug: brand.slug })
    .from(brand)
    .where(and(eq(brand.orgId, ctx.orgId), eq(brand.active, true)))
    .orderBy(brand.slug);

  const marcaSelecionada = marcas.find((item) => item.slug === brandFiltro);
  const limiteParado = subDays(agora, DIAS_PARA_PARADO);

  const condicoesPedido = [
    eq(pedido.orgId, ctx.orgId),
    gte(pedido.createdAt, inicioBusca),
    // Cancelado e devolvido não são faturamento nem venda de produto.
    ne(pedido.status, "cancelado"),
    ne(pedido.status, "devolvido"),
  ];
  if (marcaSelecionada) condicoesPedido.push(eq(pedido.brandId, marcaSelecionada.id));

  const condicoesProduto = [
    eq(produto.orgId, ctx.orgId),
    eq(produto.ativo, true),
    isNull(produto.deletedAt),
  ];
  if (marcaSelecionada) condicoesProduto.push(eq(produto.brandId, marcaSelecionada.id));

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
        custo: produto.custo,
        preco: produto.preco,
        estoqueMinimo: produto.estoqueMinimo,
        saldo: estoqueSaldo.saldo,
        marca: brand.slug,
      })
      .from(produto)
      .innerJoin(brand, eq(brand.id, produto.brandId))
      .leftJoin(estoqueSaldo, eq(estoqueSaldo.produtoId, produto.id))
      .where(and(...condicoesProduto)),
    ctx.db
      .select({ produtoId: estoqueMovimento.produtoId, ultima: max(estoqueMovimento.createdAt) })
      .from(estoqueMovimento)
      .where(and(eq(estoqueMovimento.orgId, ctx.orgId), eq(estoqueMovimento.tipo, "saida")))
      .groupBy(estoqueMovimento.produtoId),
  ]);

  /* ── Faturamento ── */
  const baldes = montarBaldes(agora, granularidade);
  let totalJanela = 0;
  let pedidosNaJanela = 0;
  let totalJanelaAnterior = 0;

  for (const item of pedidosJanela) {
    const valor = parseMoney(item.total);
    const chave = inicioDoBalde(item.createdAt, granularidade).getTime();
    if (baldes.has(chave)) baldes.set(chave, (baldes.get(chave) ?? 0) + valor);

    if (item.createdAt >= inicioJanela) {
      totalJanela += valor;
      pedidosNaJanela += 1;
    } else if (item.createdAt >= inicioJanelaAnterior) {
      totalJanelaAnterior += valor;
    }
  }

  const valoresSerie = [...baldes.values()];
  const maiorValor = Math.max(...valoresSerie, 0);
  const serie: SeriePonto[] = [...baldes.entries()].map(([chave, valor]) => ({
    label: rotuloDoBalde(new Date(chave), granularidade),
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
    pedidos: pedidosNaJanela,
    ticketMedio: formatCurrency(pedidosNaJanela > 0 ? totalJanela / pedidosNaJanela : 0),
    serie,
    janelaLabel: GRANULARIDADE_LABEL[granularidade],
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

  /** Capital imobilizado: custo quando cadastrado, senão preço de venda. */
  const valorUnitario = (item: typeof produtosAtivos[number]): number =>
    parseMoney(item.custo) || parseMoney(item.preco);

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
  }));

  /* ── 2. Produtos que não vendem (giro baixo) ── */
  const giroBaixo: ProdutoGiroBaixo[] = produtosAtivos
    .filter((item) => (item.saldo ?? 0) > 0)
    .map((item) => ({ item, quantidade: vendasPorProduto.get(item.id)?.quantidade ?? 0 }))
    .filter(({ quantidade }) => quantidade <= LIMITE_GIRO_BAIXO)
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
    }));

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
    }));

  /* ── 4. Reposição (baixo estoque, ainda em tempo) ── */
  const reposicao: ProdutoReposicao[] = produtosAtivos
    .filter((item) => {
      const saldo = item.saldo ?? 0;
      const minimo = item.estoqueMinimo;
      // Sem mínimo cadastrado não há régua para avisar.
      if (minimo <= 0) return false;
      // Já bateu ou passou do mínimo: saiu da zona de "dá tempo de repor".
      return saldo > minimo && saldo <= minimo * FATOR_ZONA_ATENCAO;
    })
    .map((item) => {
      const saldo = item.saldo ?? 0;
      const minimo = item.estoqueMinimo;
      const vendidoNaJanela = vendasPorProduto.get(item.id)?.quantidade ?? 0;
      const consumoDiario = vendidoNaJanela / janelaDias;
      const folga = minimo * FATOR_ZONA_ATENCAO - minimo;
      return {
        ...base(item),
        saldo,
        minimo,
        coberturaDias: consumoDiario > 0 ? Math.floor(saldo / consumoDiario) : null,
        // 100 = encostando no mínimo; 0 = no topo da zona de atenção.
        urgencia: folga > 0 ? Math.round(((minimo * FATOR_ZONA_ATENCAO - saldo) / folga) * 100) : 100,
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

  return {
    filtros: {
      granularidade,
      brand: marcaSelecionada?.slug ?? "todas",
      brands: [
        { value: "todas", label: "Todas as marcas" },
        ...marcas.map((item) => ({ value: item.slug, label: item.name })),
      ],
    },
    faturamento,
    maisVendidos,
    giroBaixo,
    parados,
    reposicao,
  };
}
