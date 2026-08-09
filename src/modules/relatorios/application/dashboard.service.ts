import { and, desc, eq, gte, inArray, isNull, lte, sum } from "drizzle-orm";
import { startOfDay, subDays } from "date-fns";
import type { CrudContext } from "@/shared/lib/crud-factory";
import {
  appUser,
  brand,
  channelAccount,
  cliente,
  estoqueSaldo,
  llmRun,
  oportunidade,
  pedido,
  produto,
  produtoCanal,
  regua,
  reguaExecucao,
} from "@/shared/lib/db/schema";
import { getBrandConfig, isBrandSlug, type BrandSlug } from "@/shared/config/brands";

const CANAIS_PRIORITARIOS = [
  "mercadolivre",
  "shopee",
  "tiktokshop",
  "olist",
] as const;

const CANAL_LABEL: Record<string, string> = {
  mercadolivre: "Mercado Livre",
  shopee: "Shopee",
  tiktokshop: "TikTok Shop",
  olist: "Olist",
  manual: "Manual",
};

const STATUS_LABEL: Record<string, string> = {
  criado: "Criado",
  pago: "Pago",
  separado: "Separado",
  enviado: "Enviado",
  entregue: "Entregue",
  avaliacao_solicitada: "Avaliacao",
  concluido: "Concluido",
  cancelado: "Cancelado",
  devolvido: "Devolvido",
};

export interface DashboardKpi {
  label: string;
  value: string;
  sub: string;
  icon: string;
  accent: string;
}

export interface DashboardRecentClient {
  id: string;
  name: string;
  role: string;
  brand?: BrandSlug;
}

export interface DashboardRecentOrder {
  /** Identificador completo do pedido — chave estavel de lista. */
  orderId: string;
  /** Codigo curto exibido na UI; pode colidir entre pedidos. */
  id: string;
  client: string;
  brand: BrandSlug;
  status: string;
  value: string;
  href: string;
}

export interface DashboardChannel {
  name: string;
  connected: boolean;
  status: "conectado" | "degradado" | "desconectado";
  detail: string;
}

export interface DashboardFilterOption {
  value: string;
  label: string;
}

export interface DashboardFilters {
  period?: "7d" | "30d" | "90d";
  brand?: string;
  channel?: string;
}

export interface DashboardFilterState {
  period: "7d" | "30d" | "90d";
  brand: string;
  channel: string;
  brands: DashboardFilterOption[];
  channels: DashboardFilterOption[];
}

export interface DashboardChannelPerformance {
  channel: string;
  label: string;
  orders: number;
  revenue: string;
  ticket: string;
  conversion: string;
}

export interface DashboardSellerPerformance {
  id: string;
  name: string;
  opportunities: number;
  pipeline: string;
  detail: string;
}

export interface DashboardRuleBlock {
  gate: string;
  count: number;
  detail: string;
}

export interface DashboardAiUsage {
  cost: string;
  runs: number;
  successRate: string;
  detail: string;
}

export interface DashboardData {
  filters: DashboardFilterState;
  revenue: {
    value: string;
    peakLabel: string;
    pendingText: string;
    bars: number[];
  };
  kpis: DashboardKpi[];
  recentClients: DashboardRecentClient[];
  recentOrders: DashboardRecentOrder[];
  channels: DashboardChannel[];
  channelPerformance: DashboardChannelPerformance[];
  sellerPerformance: DashboardSellerPerformance[];
  ruleBlocks: DashboardRuleBlock[];
  aiUsage: DashboardAiUsage;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function parseMoney(value: string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function brandSlug(value: string | null | undefined): BrandSlug {
  if (value && isBrandSlug(value)) return value;
  throw new Error(`Marca não configurada no dashboard: ${value ?? "ausente"}`);
}

function brandLabel(value: string): string {
  return getBrandConfig(value)?.label ?? value;
}

function normalizeBars(values: number[]): number[] {
  const max = Math.max(...values, 1);
  return values.map((value) => Math.max(4, Math.round((value / max) * 100)));
}

const PERIOD_DAYS: Record<Required<DashboardFilters>["period"], number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

function normalizeFilters(filters?: DashboardFilters): Required<DashboardFilters> {
  return {
    period: filters?.period && filters.period in PERIOD_DAYS ? filters.period : "30d",
    brand: filters?.brand ?? "todas",
    channel: filters?.channel ?? "todos",
  };
}

function successStatus(status: string): boolean {
  return !["cancelado", "devolvido"].includes(status);
}

export async function obterDashboardData(ctx: CrudContext, filters?: DashboardFilters): Promise<DashboardData> {
  const agora = new Date();
  const hoje = startOfDay(agora);
  const normalizedFilters = normalizeFilters(filters);
  const periodDays = PERIOD_DAYS[normalizedFilters.period];
  const inicioPeriodo = subDays(agora, periodDays);
  const inicioGrafico = periodDays > 14 ? subDays(agora, 13) : subDays(agora, periodDays - 1);

  const marcas = await ctx.db
    .select({ id: brand.id, name: brand.name, slug: brand.slug })
    .from(brand)
    .where(and(eq(brand.orgId, ctx.orgId), eq(brand.active, true)))
    .orderBy(brand.slug);

  const selectedBrand = marcas.find((item) => item.slug === normalizedFilters.brand);
  const selectedChannel = normalizedFilters.channel !== "todos" ? normalizedFilters.channel : undefined;
  const pedidoConditions = [
    eq(pedido.orgId, ctx.orgId),
    gte(pedido.createdAt, inicioPeriodo),
  ];
  const pedidoGraficoConditions = [
    eq(pedido.orgId, ctx.orgId),
    gte(pedido.createdAt, inicioGrafico),
  ];
  const pedidoHojeConditions = [
    eq(pedido.orgId, ctx.orgId),
    gte(pedido.createdAt, hoje),
  ];
  if (selectedBrand) {
    pedidoConditions.push(eq(pedido.brandId, selectedBrand.id));
    pedidoGraficoConditions.push(eq(pedido.brandId, selectedBrand.id));
    pedidoHojeConditions.push(eq(pedido.brandId, selectedBrand.id));
  }
  if (selectedChannel) {
    pedidoConditions.push(eq(pedido.canal, selectedChannel));
    pedidoGraficoConditions.push(eq(pedido.canal, selectedChannel));
    pedidoHojeConditions.push(eq(pedido.canal, selectedChannel));
  }

  const [
    pedidosPeriodo,
    pedidosGrafico,
    pedidosHoje,
    receitaPeriodo,
    clientesRecentes,
    pedidosRecentes,
    skusAlerta,
    contas,
    mapeamentos,
    execucoesRegua,
    consumoIa,
    oportunidades,
  ] = await Promise.all([
    ctx.db
      .select({
        id: pedido.id,
        total: pedido.total,
        status: pedido.status,
        canal: pedido.canal,
        createdAt: pedido.createdAt,
      })
      .from(pedido)
      .where(and(...pedidoConditions)),
    ctx.db
      .select({ id: pedido.id, total: pedido.total, createdAt: pedido.createdAt })
      .from(pedido)
      .where(and(...pedidoGraficoConditions)),
    ctx.db
      .select({ id: pedido.id })
      .from(pedido)
      .where(and(...pedidoHojeConditions)),
    ctx.db
      .select({ total: sum(pedido.total) })
      .from(pedido)
      .where(and(...pedidoConditions)),
    ctx.db
      .select({
        id: cliente.id,
        nome: cliente.nome,
        createdAt: cliente.createdAt,
      })
      .from(cliente)
      .where(and(eq(cliente.orgId, ctx.orgId), isNull(cliente.deletedAt)))
      .orderBy(desc(cliente.createdAt))
      .limit(5),
    ctx.db
      .select({
        id: pedido.id,
        total: pedido.total,
        status: pedido.status,
        canal: pedido.canal,
        createdAt: pedido.createdAt,
        clienteNome: cliente.nome,
        brandSlug: brand.slug,
      })
      .from(pedido)
      .innerJoin(cliente, eq(cliente.id, pedido.clienteId))
      .innerJoin(brand, eq(brand.id, pedido.brandId))
      .where(and(...pedidoConditions))
      .orderBy(desc(pedido.createdAt))
      .limit(5),
    ctx.db
      .select({ id: produto.id })
      .from(produto)
      .leftJoin(estoqueSaldo, eq(estoqueSaldo.produtoId, produto.id))
      .where(and(
        eq(produto.orgId, ctx.orgId),
        eq(produto.ativo, true),
        isNull(produto.deletedAt),
        lte(estoqueSaldo.saldo, produto.estoqueMinimo),
      )),
    ctx.db
      .select({
        id: channelAccount.id,
        tipo: channelAccount.tipo,
        nome: channelAccount.nome,
        status: channelAccount.status,
        ultimaVerificacao: channelAccount.ultimaVerificacao,
        ultimoErro: channelAccount.ultimoErro,
        brandSlug: brand.slug,
      })
      .from(channelAccount)
      .innerJoin(brand, eq(brand.id, channelAccount.brandId))
      .where(eq(channelAccount.orgId, ctx.orgId))
      .orderBy(channelAccount.tipo, brand.slug),
    ctx.db
      .select({
        channelAccountId: produtoCanal.channelAccountId,
        produtoId: produtoCanal.produtoId,
      })
      .from(produtoCanal)
      .where(and(eq(produtoCanal.orgId, ctx.orgId), eq(produtoCanal.ativo, true))),
    ctx.db
      .select({
        status: reguaExecucao.status,
        gate: reguaExecucao.gateBloqueado,
        motivo: reguaExecucao.motivoBloqueio,
        brandSlug: brand.slug,
      })
      .from(reguaExecucao)
      .innerJoin(regua, eq(regua.id, reguaExecucao.reguaId))
      .innerJoin(brand, eq(brand.id, regua.brandId))
      .where(and(
        eq(reguaExecucao.orgId, ctx.orgId),
        gte(reguaExecucao.createdAt, inicioPeriodo),
        selectedBrand ? eq(regua.brandId, selectedBrand.id) : undefined,
      )),
    ctx.db
      .select({
        finalidade: llmRun.finalidade,
        sucesso: llmRun.sucesso,
        custoUsd: llmRun.custoUsd,
      })
      .from(llmRun)
      .where(and(eq(llmRun.orgId, ctx.orgId), gte(llmRun.createdAt, inicioPeriodo))),
    ctx.db
      .select({
        id: oportunidade.id,
        valor: oportunidade.valor,
        responsavelId: oportunidade.responsavelId,
        responsavelNome: appUser.nome,
        responsavelEmail: appUser.email,
      })
      .from(oportunidade)
      .leftJoin(appUser, eq(appUser.id, oportunidade.responsavelId))
      .where(and(
        eq(oportunidade.orgId, ctx.orgId),
        gte(oportunidade.createdAt, inicioPeriodo),
        selectedBrand ? eq(oportunidade.brandId, selectedBrand.id) : undefined,
      )),
  ]);

  const receitaTotalPeriodo = parseMoney(receitaPeriodo[0]?.total);
  const porDia = new Map<string, number>();
  const diasGrafico = Math.min(14, periodDays);
  for (let i = 0; i < diasGrafico; i++) {
    const dia = startOfDay(subDays(agora, diasGrafico - 1 - i)).toISOString().slice(0, 10);
    porDia.set(dia, 0);
  }
  for (const item of pedidosGrafico) {
    const dia = startOfDay(item.createdAt).toISOString().slice(0, 10);
    porDia.set(dia, (porDia.get(dia) ?? 0) + parseMoney(item.total));
  }
  const receitasDiarias = [...porDia.values()];
  const pico = Math.max(...receitasDiarias, 0);

  const clienteIds = clientesRecentes.map((item) => item.id);
  const ultimosPedidosDosClientes = clienteIds.length > 0
    ? await ctx.db
        .select({
          clienteId: pedido.clienteId,
          canal: pedido.canal,
          brandSlug: brand.slug,
          createdAt: pedido.createdAt,
        })
        .from(pedido)
        .innerJoin(brand, eq(brand.id, pedido.brandId))
        .where(and(eq(pedido.orgId, ctx.orgId), inArray(pedido.clienteId, clienteIds)))
        .orderBy(desc(pedido.createdAt))
    : [];

  const ultimoPedidoPorCliente = new Map<string, typeof ultimosPedidosDosClientes[number]>();
  for (const item of ultimosPedidosDosClientes) {
    if (!ultimoPedidoPorCliente.has(item.clienteId)) {
      ultimoPedidoPorCliente.set(item.clienteId, item);
    }
  }

  const mapeamentosPorConta = new Map<string, number>();
  for (const item of mapeamentos) {
    mapeamentosPorConta.set(
      item.channelAccountId,
      (mapeamentosPorConta.get(item.channelAccountId) ?? 0) + 1,
    );
  }

  const contasFiltradas = contas.filter((conta) => (
    (!selectedBrand || conta.brandSlug === selectedBrand.slug)
    && (!selectedChannel || conta.tipo === selectedChannel)
  ));
  const canaisExistentes = contasFiltradas.map((conta) => {
    const totalMapeado = mapeamentosPorConta.get(conta.id) ?? 0;
    const detailParts = [
      brandLabel(conta.brandSlug),
      `${totalMapeado} SKU${totalMapeado === 1 ? "" : "s"}`,
    ];
    if (conta.ultimoErro) detailParts.push("com erro recente");
    return {
      name: `${CANAL_LABEL[conta.tipo] ?? conta.tipo} · ${brandLabel(conta.brandSlug)}`,
      connected: conta.status === "conectado",
      status: conta.status,
      detail: detailParts.join(" · "),
    };
  });

  const tiposPresentes = new Set(contas.map((conta) => conta.tipo));
  const canaisPendentes = CANAIS_PRIORITARIOS
    .filter((tipo) => !tiposPresentes.has(tipo))
    .map((tipo) => ({
      name: CANAL_LABEL[tipo],
      connected: false,
      status: "desconectado" as const,
      detail: "Conta ainda nao cadastrada",
    }));

  const canaisPerformanceMap = new Map<string, { orders: number; success: number; revenue: number }>();
  for (const item of pedidosPeriodo) {
    const current = canaisPerformanceMap.get(item.canal) ?? { orders: 0, success: 0, revenue: 0 };
    current.orders += 1;
    if (successStatus(item.status)) current.success += 1;
    current.revenue += parseMoney(item.total);
    canaisPerformanceMap.set(item.canal, current);
  }
  const channelPerformance = [...canaisPerformanceMap.entries()]
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 6)
    .map(([canal, item]) => ({
      channel: canal,
      label: CANAL_LABEL[canal] ?? canal,
      orders: item.orders,
      revenue: formatCurrency(item.revenue),
      ticket: formatCurrency(item.orders > 0 ? item.revenue / item.orders : 0),
      conversion: item.orders > 0 ? `${Math.round((item.success / item.orders) * 100)}%` : "0%",
    }));

  const sellerMap = new Map<string, { name: string; opportunities: number; pipeline: number }>();
  for (const item of oportunidades) {
    const id = item.responsavelId ?? "sem-responsavel";
    const current = sellerMap.get(id) ?? {
      name: item.responsavelNome ?? item.responsavelEmail ?? "Sem responsavel",
      opportunities: 0,
      pipeline: 0,
    };
    current.opportunities += 1;
    current.pipeline += parseMoney(item.valor);
    sellerMap.set(id, current);
  }
  const sellerPerformance = [...sellerMap.entries()]
    .sort((a, b) => b[1].pipeline - a[1].pipeline)
    .slice(0, 5)
    .map(([id, item]) => ({
      id,
      name: item.name,
      opportunities: item.opportunities,
      pipeline: formatCurrency(item.pipeline),
      detail: "Funil por responsavel; pedido ainda nao guarda vendedor",
    }));

  const blocked = execucoesRegua.filter((item) => item.status === "bloqueada");
  const blocksMap = new Map<string, { count: number; reason: string }>();
  for (const item of blocked) {
    const gate = item.gate ?? "sem_gate";
    const current = blocksMap.get(gate) ?? { count: 0, reason: item.motivo ?? "Bloqueio sem motivo registrado" };
    current.count += 1;
    if (item.motivo) current.reason = item.motivo;
    blocksMap.set(gate, current);
  }
  const ruleBlocks = [...blocksMap.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([gate, item]) => ({ gate, count: item.count, detail: item.reason }));

  const aiCost = consumoIa.reduce((total, item) => total + parseMoney(item.custoUsd), 0);
  const aiSuccess = consumoIa.filter((item) => item.sucesso === "true").length;

  return {
    filters: {
      period: normalizedFilters.period,
      brand: selectedBrand?.slug ?? "todas",
      channel: selectedChannel ?? "todos",
      brands: [
        { value: "todas", label: "Todas as marcas" },
        ...marcas.map((item) => ({ value: item.slug, label: item.name })),
      ],
      channels: [
        { value: "todos", label: "Todos os canais" },
        ...[...new Set([...CANAIS_PRIORITARIOS, "manual" as const])].map((item) => ({
          value: item,
          label: CANAL_LABEL[item] ?? item,
        })),
      ],
    },
    revenue: {
      value: formatCurrency(receitaTotalPeriodo),
      peakLabel: formatCurrency(pico),
      pendingText: pedidosPeriodo.length > 0
        ? `${formatNumber(pedidosPeriodo.length)} pedido${pedidosPeriodo.length === 1 ? "" : "s"} nos ultimos ${periodDays} dias`
        : "Sem pedidos reais no periodo",
      bars: normalizeBars(receitasDiarias),
    },
    kpis: [
      {
        label: "Pedidos hoje",
        value: formatNumber(pedidosHoje.length),
        sub: pedidosHoje.length > 0 ? "Operacao em movimento" : "Nenhum pedido recebido hoje",
        icon: "ShoppingBag",
        accent: "#E3131B",
      },
      {
        label: "Receita 30d",
        value: formatCurrency(receitaTotalPeriodo),
        sub: receitaTotalPeriodo > 0 ? `Periodo: ${periodDays} dias` : "Aguardando pedidos reais",
        icon: "DollarSign",
        accent: "#9B30D9",
      },
      {
        label: "Clientes",
        value: formatNumber(clientesRecentes.length),
        sub: clientesRecentes.length > 0 ? "Ultimos cadastrados" : "Base ainda vazia",
        icon: "Users",
        accent: "#2563EB",
      },
      {
        label: "SKUs em alerta",
        value: formatNumber(skusAlerta.length),
        sub: skusAlerta.length > 0 ? "Saldo no minimo ou abaixo" : "Sem alerta de minimo",
        icon: "AlertTriangle",
        accent: "#B57A00",
      },
    ],
    recentClients: clientesRecentes.map((item) => {
      const ultimoPedido = ultimoPedidoPorCliente.get(item.id);
      return {
        id: item.id,
        name: item.nome,
        role: ultimoPedido
          ? `${CANAL_LABEL[ultimoPedido.canal] ?? ultimoPedido.canal} · ${brandLabel(ultimoPedido.brandSlug)}`
          : "Cadastro sem pedido",
        brand: ultimoPedido ? brandSlug(ultimoPedido.brandSlug) : undefined,
      };
    }),
    recentOrders: pedidosRecentes.map((item) => ({
      orderId: item.id,
      id: `#${item.id.slice(0, 8)}`,
      client: item.clienteNome,
      brand: brandSlug(item.brandSlug),
      status: STATUS_LABEL[item.status] ?? item.status,
      value: formatCurrency(parseMoney(item.total)),
      href: `/vendas/pedidos/${item.id}`,
    })),
    channels: [...canaisExistentes, ...canaisPendentes].slice(0, 8),
    channelPerformance,
    sellerPerformance,
    ruleBlocks,
    aiUsage: {
      cost: `US$ ${aiCost.toFixed(2)}`,
      runs: consumoIa.length,
      successRate: consumoIa.length > 0 ? `${Math.round((aiSuccess / consumoIa.length) * 100)}%` : "0%",
      detail: consumoIa.length > 0 ? "Execucoes auditadas em llm_run" : "Sem consumo de IA no periodo",
    },
  };
}
