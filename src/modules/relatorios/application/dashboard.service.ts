import { and, desc, eq, gte, inArray, isNull, lte, sum } from "drizzle-orm";
import { startOfDay, subDays } from "date-fns";
import type { CrudContext } from "@/shared/lib/crud-factory";
import {
  brand,
  channelAccount,
  cliente,
  estoqueSaldo,
  pedido,
  produto,
  produtoCanal,
} from "@/shared/lib/db/schema";

const CANAIS_PRIORITARIOS = [
  "whatsapp",
  "mercadolivre",
  "shopee",
  "tiktokshop",
  "olist",
] as const;

const CANAL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
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
  brand?: "karzi" | "wuwu";
}

export interface DashboardRecentOrder {
  id: string;
  client: string;
  brand: "karzi" | "wuwu";
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

export interface DashboardData {
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

function brandSlug(value: string | null | undefined): "karzi" | "wuwu" {
  return value === "wuwu" ? "wuwu" : "karzi";
}

function normalizeBars(values: number[]): number[] {
  const max = Math.max(...values, 1);
  return values.map((value) => Math.max(4, Math.round((value / max) * 100)));
}

export async function obterDashboardData(ctx: CrudContext): Promise<DashboardData> {
  const agora = new Date();
  const hoje = startOfDay(agora);
  const ultimos30Dias = subDays(agora, 30);
  const ultimos14Dias = subDays(agora, 13);

  const [
    pedidos30,
    pedidosHoje,
    receita30,
    clientesRecentes,
    pedidosRecentes,
    skusAlerta,
    contas,
    mapeamentos,
  ] = await Promise.all([
    ctx.db
      .select({ id: pedido.id, total: pedido.total, createdAt: pedido.createdAt })
      .from(pedido)
      .where(and(eq(pedido.orgId, ctx.orgId), gte(pedido.createdAt, ultimos14Dias))),
    ctx.db
      .select({ id: pedido.id })
      .from(pedido)
      .where(and(eq(pedido.orgId, ctx.orgId), gte(pedido.createdAt, hoje))),
    ctx.db
      .select({ total: sum(pedido.total) })
      .from(pedido)
      .where(and(eq(pedido.orgId, ctx.orgId), gte(pedido.createdAt, ultimos30Dias))),
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
      .where(eq(pedido.orgId, ctx.orgId))
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
  ]);

  const receitaTotal30 = parseMoney(receita30[0]?.total);
  const porDia = new Map<string, number>();
  for (let i = 0; i < 14; i++) {
    const dia = startOfDay(subDays(agora, 13 - i)).toISOString().slice(0, 10);
    porDia.set(dia, 0);
  }
  for (const item of pedidos30) {
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

  const canaisExistentes = contas.map((conta) => {
    const totalMapeado = mapeamentosPorConta.get(conta.id) ?? 0;
    const detailParts = [
      conta.brandSlug.toUpperCase(),
      `${totalMapeado} SKU${totalMapeado === 1 ? "" : "s"}`,
    ];
    if (conta.ultimoErro) detailParts.push("com erro recente");
    return {
      name: `${CANAL_LABEL[conta.tipo] ?? conta.tipo} · ${conta.brandSlug.toUpperCase()}`,
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

  return {
    revenue: {
      value: formatCurrency(receitaTotal30),
      peakLabel: formatCurrency(pico),
      pendingText: pedidos30.length > 0
        ? `${formatNumber(pedidos30.length)} pedido${pedidos30.length === 1 ? "" : "s"} nos ultimos 14 dias`
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
        value: formatCurrency(receitaTotal30),
        sub: receitaTotal30 > 0 ? "Pedidos normalizados" : "Aguardando pedidos reais",
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
          ? `${CANAL_LABEL[ultimoPedido.canal] ?? ultimoPedido.canal} · ${ultimoPedido.brandSlug.toUpperCase()}`
          : "Cadastro sem pedido",
        brand: ultimoPedido ? brandSlug(ultimoPedido.brandSlug) : undefined,
      };
    }),
    recentOrders: pedidosRecentes.map((item) => ({
      id: `#${item.id.slice(0, 8)}`,
      client: item.clienteNome,
      brand: brandSlug(item.brandSlug),
      status: STATUS_LABEL[item.status] ?? item.status,
      value: formatCurrency(parseMoney(item.total)),
      href: `/vendas/pedidos/${item.id}`,
    })),
    channels: [...canaisExistentes, ...canaisPendentes].slice(0, 8),
  };
}
