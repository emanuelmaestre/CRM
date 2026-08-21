import { eq, and } from "drizzle-orm";
import { assertPerfil, createCrudFactory, type CrudContext } from "@/shared/lib/crud-factory";
import { db } from "@/shared/lib/db";
import { pedido, pedidoItem } from "@/shared/lib/db/schema";
import { despacharEvento, emitirEvento, persistirEvento } from "@/shared/events";
import { validarTransicaoPedido, type PedidoStatus } from "../domain/state-machine";
import type { ConsultaPedidos } from "../domain/consulta-pedidos";
import {
  consultarPedidosDetalhados,
  consultarPedidosPorCanal,
  consultarPedidosPorMarca,
  consultarResumoPedidos,
} from "../infrastructure/pedidos.repository";

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
  opts: ConsultaPedidos & { limit?: number; offset?: number } = {},
) {
  assertPerfil(ctx, ["admin", "gestor", "vendedor"]);
  return consultarPedidosDetalhados(ctx.orgId, {
    ...opts,
    limit: opts.limit ?? 50,
    offset: opts.offset ?? 0,
  });
}

/** Resumo financeiro de leitura da mesma seleção exibida na lista. */
export async function resumirPedidos(
  ctx: CrudContext,
  opts: ConsultaPedidos = {},
) {
  assertPerfil(ctx, ["admin", "gestor", "vendedor"]);
  return consultarResumoPedidos(ctx.orgId, opts);
}

/** Alimenta as pílulas de marca/canal no topo da tela de Pedidos — mesmo
 *  espírito de `contarProdutosPorMarca`/`contarProdutosPorCanal` do Estoque:
 *  cada dimensão é contada já cruzada com a outra, para a pílula nunca
 *  prometer um número que a lista não entrega. */
export async function contarPedidosPorMarca(ctx: CrudContext, opts: { canais?: string[] } = {}) {
  assertPerfil(ctx, ["admin", "gestor", "vendedor"]);
  return consultarPedidosPorMarca(ctx.orgId, opts.canais);
}

export async function contarPedidosPorCanal(ctx: CrudContext, opts: { brandIds?: string[] } = {}) {
  assertPerfil(ctx, ["admin", "gestor", "vendedor"]);
  return consultarPedidosPorCanal(ctx.orgId, opts.brandIds);
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
