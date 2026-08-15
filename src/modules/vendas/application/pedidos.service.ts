import { eq, and, or, count, desc, asc, sql, inArray, gte, lte, ilike, SQL } from "drizzle-orm";
import { assertPerfil, createCrudFactory, type CrudContext } from "@/shared/lib/crud-factory";
import { db } from "@/shared/lib/db";
import { brand, channelAccount, cliente, pedido, pedidoItem } from "@/shared/lib/db/schema";
import { despacharEvento, emitirEvento, persistirEvento } from "@/shared/events";
import { validarTransicaoPedido, type PedidoStatus } from "../domain/state-machine";

const crudPedido = createCrudFactory({
  table: pedido,
  entityName: "pedido",
  allowedPerfis: {
    create: ["admin", "gestor", "vendedor"],
    update: ["admin", "gestor"],
    delete: ["admin"],
    read: ["admin", "gestor", "vendedor"],
  },
});

export async function criarPedido(
  ctx: CrudContext,
  input: {
    brandId: string;
    clienteId: string;
    canal: string;
    total: string;
    frete?: string;
    desconto?: string;
    providerOrderId?: string;
    itens: { produtoId: string; quantidade: number; precoUnitario: string }[];
  }
) {
  const novoPedido = await crudPedido.create(ctx, {
    brandId: input.brandId,
    clienteId: input.clienteId,
    canal: input.canal,
    total: input.total,
    frete: input.frete ?? "0",
    desconto: input.desconto ?? "0",
    providerOrderId: input.providerOrderId,
    status: "criado",
  });

  const pedidoId = (novoPedido as { id: string }).id;

  await db.insert(pedidoItem).values(
    input.itens.map((i) => ({ pedidoId, ...i }))
  );

  await emitirEvento({
    tipo: "pedido.recebido",
    orgId: ctx.orgId,
    brandId: input.brandId,
    entidade: "pedido",
    entidadeId: pedidoId,
    payload: { clienteId: input.clienteId, canal: input.canal, total: input.total },
  });

  return { pedido: novoPedido };
}

export async function avancarStatusPedido(
  ctx: CrudContext,
  pedidoId: string,
  novoStatus: PedidoStatus,
  motivo?: string
) {
  assertPerfil(ctx, ["admin", "gestor"]);

  const rows = await db.select().from(pedido)
    .where(and(eq(pedido.id, pedidoId), eq(pedido.orgId, ctx.orgId)));
  const atual = rows[0];
  if (!atual) throw new Error("Pedido não encontrado.");

  validarTransicaoPedido(atual.status as PedidoStatus, novoStatus);

  const tipoEvento = `pedido.${novoStatus}` as `pedido.${PedidoStatus}`;
  const evento = await db.transaction(async (tx) => {
    const [atualizado] = await tx.update(pedido)
      .set({ status: novoStatus, updatedAt: new Date(), ...(motivo ? { canceladoMotivo: motivo } : {}) })
      .where(and(
        eq(pedido.id, pedidoId),
        eq(pedido.orgId, ctx.orgId),
        eq(pedido.status, atual.status),
      ))
      .returning({ id: pedido.id });

    if (!atualizado) {
      throw new Error("O pedido foi alterado por outra operaÃ§Ã£o. Atualize a tela e tente novamente.");
    }

    return persistirEvento({
      tipo: tipoEvento as never,
      orgId: ctx.orgId,
      brandId: atual.brandId,
      entidade: "pedido",
      entidadeId: pedidoId,
      payload: { status: novoStatus, statusAnterior: atual.status, motivo },
    }, tx);
  });

  // A baixa/estorno pertence aos jobs A2/A3. O evento jÃ¡ estÃ¡ persistido
  // quando o envio ocorre, evitando status alterado sem trilha de domÃ­nio.
  await despacharEvento(evento);

  return { pedidoId, statusAnterior: atual.status, novoStatus };
}

export async function listarPedidos(ctx: CrudContext, opts: { clienteId?: string; brandId?: string; limit?: number; offset?: number } = {}) {
  const filters: ReturnType<typeof eq>[] = [];
  if (opts.clienteId) filters.push(eq(pedido.clienteId, opts.clienteId));
  if (opts.brandId) filters.push(eq(pedido.brandId, opts.brandId));
  return crudPedido.list(ctx, { filters, limit: opts.limit, offset: opts.offset });
}

/** Alimenta a tela de Pedidos: junta cliente/marca (a fábrica de CRUD genérica
 *  não faz join, só devolveria a linha crua de `pedido`) e aceita os mesmos
 *  filtros que a pessoa vê na tela — marca, canal, status — com paginação de
 *  verdade. A página antiga fazia uma consulta sem filtro nenhum, travada em
 *  200 linhas: passado isso, o resto dos pedidos ficava simplesmente invisível,
 *  sem qualquer aviso de que a lista estava cortada. */
export async function listarPedidosDetalhados(
  ctx: CrudContext,
  opts: {
    brandIds?: string[];
    canal?: string;
    status?: PedidoStatus;
    busca?: string;
    inicio?: Date;
    fim?: Date;
    limit?: number;
    offset?: number;
  } = {},
) {
  assertPerfil(ctx, ["admin", "gestor", "vendedor"]);
  const { limit = 50, offset = 0 } = opts;

  const filters: SQL[] = [eq(pedido.orgId, ctx.orgId)];
  if (opts.brandIds?.length) filters.push(inArray(pedido.brandId, opts.brandIds));
  if (opts.canal) filters.push(eq(pedido.canal, opts.canal));
  if (opts.status) filters.push(eq(pedido.status, opts.status));
  if (opts.inicio) filters.push(gte(pedido.createdAt, opts.inicio));
  if (opts.fim) filters.push(lte(pedido.createdAt, opts.fim));
  if (opts.busca?.trim()) {
    const termo = `%${opts.busca.trim()}%`;
    filters.push(or(
      ilike(pedido.providerOrderId, termo),
      ilike(cliente.nome, termo),
      ilike(cliente.nomeCompleto, termo),
    )!);
  }

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: pedido.id,
        providerOrderId: pedido.providerOrderId,
        clienteNome: cliente.nome,
        brandId: pedido.brandId,
        brandNome: brand.name,
        brandSlug: brand.slug,
        canal: pedido.canal,
        status: pedido.status,
        total: pedido.total,
        frete: pedido.frete,
        desconto: pedido.desconto,
        origemIngestao: pedido.origemIngestao,
        receivedAt: pedido.receivedAt,
        createdAt: pedido.createdAt,
      })
      .from(pedido)
      .innerJoin(cliente, eq(cliente.id, pedido.clienteId))
      .innerJoin(brand, eq(brand.id, pedido.brandId))
      .where(and(...filters))
      .orderBy(desc(pedido.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(pedido)
      .innerJoin(cliente, eq(cliente.id, pedido.clienteId))
      .where(and(...filters)),
  ]);

  return { data: rows, total: totalRows[0]?.total ?? 0, limit, offset };
}

/** Resumo financeiro da mesma seleção exibida na lista. São agregações de
 * leitura; não disparam tarefa, alerta ou qualquer automação interna. */
export async function resumirPedidos(
  ctx: CrudContext,
  opts: { brandIds?: string[]; canal?: string; status?: PedidoStatus; busca?: string; inicio?: Date; fim?: Date } = {},
) {
  assertPerfil(ctx, ["admin", "gestor", "vendedor"]);
  const filters: SQL[] = [eq(pedido.orgId, ctx.orgId)];
  if (opts.brandIds?.length) filters.push(inArray(pedido.brandId, opts.brandIds));
  if (opts.canal) filters.push(eq(pedido.canal, opts.canal));
  if (opts.status) filters.push(eq(pedido.status, opts.status));
  if (opts.inicio) filters.push(gte(pedido.createdAt, opts.inicio));
  if (opts.fim) filters.push(lte(pedido.createdAt, opts.fim));
  if (opts.busca?.trim()) {
    const termo = `%${opts.busca.trim()}%`;
    filters.push(or(ilike(pedido.providerOrderId, termo), ilike(cliente.nome, termo), ilike(cliente.nomeCompleto, termo))!);
  }

  const [resumo] = await db
    .select({
      totalPedidos: count(),
      faturamento: sql<string>`coalesce(sum(${pedido.total}) filter (where ${pedido.status} not in ('cancelado', 'devolvido')), 0)`,
      ticketMedio: sql<string>`coalesce(avg(${pedido.total}) filter (where ${pedido.status} not in ('cancelado', 'devolvido')), 0)`,
      cancelados: sql<number>`count(*) filter (where ${pedido.status} in ('cancelado', 'devolvido'))`,
      freteTotal: sql<string>`coalesce(sum(${pedido.frete}) filter (where ${pedido.status} not in ('cancelado', 'devolvido')), 0)`,
      descontosTotal: sql<string>`coalesce(sum(${pedido.desconto}) filter (where ${pedido.status} not in ('cancelado', 'devolvido')), 0)`,
    })
    .from(pedido)
    .innerJoin(cliente, eq(cliente.id, pedido.clienteId))
    .where(and(...filters));

  return {
    totalPedidos: Number(resumo?.totalPedidos ?? 0),
    faturamento: Number(resumo?.faturamento ?? 0),
    ticketMedio: Number(resumo?.ticketMedio ?? 0),
    cancelados: Number(resumo?.cancelados ?? 0),
    freteTotal: Number(resumo?.freteTotal ?? 0),
    descontosTotal: Number(resumo?.descontosTotal ?? 0),
  };
}

/** Alimenta as pílulas de marca/canal no topo da tela de Pedidos — mesmo
 *  espírito de `contarProdutosPorMarca`/`contarProdutosPorCanal` do Estoque:
 *  cada dimensão é contada já cruzada com a outra, para a pílula nunca
 *  prometer um número que a lista não entrega. */
export async function contarPedidosPorMarca(ctx: CrudContext, opts: { canal?: string } = {}) {
  assertPerfil(ctx, ["admin", "gestor", "vendedor"]);
  const filters: SQL[] = [eq(pedido.orgId, ctx.orgId)];
  if (opts.canal) filters.push(eq(pedido.canal, opts.canal));

  return db
    .select({
      brandId: brand.id,
      nome: brand.name,
      slug: brand.slug,
      total: sql<number>`count(${pedido.id})`,
    })
    .from(brand)
    .leftJoin(pedido, and(eq(pedido.brandId, brand.id), ...filters))
    .where(and(eq(brand.orgId, ctx.orgId), eq(brand.active, true)))
    .groupBy(brand.id, brand.name, brand.slug)
    .orderBy(desc(sql`count(${pedido.id})`), asc(brand.name))
    .then((linhas) => linhas.map((linha) => ({ ...linha, total: Number(linha.total) })));
}

export async function contarPedidosPorCanal(ctx: CrudContext, opts: { brandIds?: string[] } = {}) {
  assertPerfil(ctx, ["admin", "gestor", "vendedor"]);

  const contas = await db
    .select({ tipo: channelAccount.tipo, status: channelAccount.status })
    .from(channelAccount)
    .where(eq(channelAccount.orgId, ctx.orgId));
  const conectadoPorTipo = new Map<string, boolean>();
  for (const conta of contas) {
    if (conta.status === "conectado") conectadoPorTipo.set(conta.tipo, true);
    else if (!conectadoPorTipo.has(conta.tipo)) conectadoPorTipo.set(conta.tipo, false);
  }

  const filters: SQL[] = [eq(pedido.orgId, ctx.orgId)];
  if (opts.brandIds?.length) filters.push(inArray(pedido.brandId, opts.brandIds));
  const contagens = await db
    .select({ canal: pedido.canal, total: count() })
    .from(pedido)
    .where(and(...filters))
    .groupBy(pedido.canal);
  const totalPorCanal = new Map(contagens.map((linha) => [linha.canal, Number(linha.total)]));

  // Lista fechada de canais de venda do PRD (§M3) — o mesmo conjunto que o
  // seletor de canal do Estoque usa, então "canal" significa a mesma coisa
  // nas duas telas.
  return (["mercadolivre", "shopee", "tiktokshop"] as const).map((tipo) => ({
    tipo,
    conectado: conectadoPorTipo.get(tipo) ?? false,
    total: totalPorCanal.get(tipo) ?? 0,
  }));
}

/** Cancela um pedido — a única transição de status hoje disparável por uma
 *  pessoa (as demais vêm da sincronização com o canal). `podeCancelar` decide
 *  se o botão aparece na tela; a validação de verdade continua sendo
 *  `avancarStatusPedido`, que também tranca contra corrida otimista. */
export async function cancelarPedido(ctx: CrudContext, pedidoId: string, motivo: string) {
  assertPerfil(ctx, ["admin", "gestor"]);
  if (motivo.trim().length < 3) {
    throw new Error("Informe o motivo do cancelamento (mín. 3 caracteres).");
  }
  return avancarStatusPedido(ctx, pedidoId, "cancelado", motivo.trim());
}
