import { eq, and } from "drizzle-orm";
import { createCrudFactory, type CrudContext } from "@/shared/lib/crud-factory";
import { db } from "@/shared/lib/db";
import { pedido, pedidoItem } from "@/shared/lib/db/schema";
import { emitirEvento } from "@/shared/events";
import { registrarMovimento } from "@/modules/estoque/application/estoque.service";
import { validarTransicaoPedido, podeCancelar, type PedidoStatus } from "../domain/state-machine";

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
  const rows = await db.select().from(pedido)
    .where(and(eq(pedido.id, pedidoId), eq(pedido.orgId, ctx.orgId)));
  const atual = rows[0];
  if (!atual) throw new Error("Pedido não encontrado.");

  validarTransicaoPedido(atual.status as PedidoStatus, novoStatus);

  await db.update(pedido)
    .set({ status: novoStatus, updatedAt: new Date(), ...(motivo ? { canceladoMotivo: motivo } : {}) })
    .where(eq(pedido.id, pedidoId));

  const tipoEvento = `pedido.${novoStatus}` as `pedido.${PedidoStatus}`;
  await emitirEvento({
    tipo: tipoEvento as never,
    orgId: ctx.orgId,
    brandId: atual.brandId,
    entidade: "pedido",
    entidadeId: pedidoId,
    payload: { status: novoStatus, motivo },
  });

  if (novoStatus === "pago") {
    const itens = await db.select().from(pedidoItem).where(eq(pedidoItem.pedidoId, pedidoId));
    for (const item of itens) {
      await registrarMovimento(ctx, {
        produtoId: item.produtoId,
        tipo: "saida",
        quantidade: item.quantidade,
        referenciaId: pedidoId,
        referenciaTipo: "pedido",
      });
    }
  }

  if (novoStatus === "cancelado") {
    const itens = await db.select().from(pedidoItem).where(eq(pedidoItem.pedidoId, pedidoId));
    if (["pago", "separado"].includes(atual.status)) {
      for (const item of itens) {
        await registrarMovimento(ctx, {
          produtoId: item.produtoId,
          tipo: "estorno",
          quantidade: item.quantidade,
          referenciaId: pedidoId,
          referenciaTipo: "pedido_cancelado",
        });
      }
    }
  }

  return { pedidoId, statusAnterior: atual.status, novoStatus };
}

export async function listarPedidos(ctx: CrudContext, opts: { clienteId?: string; brandId?: string; limit?: number; offset?: number } = {}) {
  const filters: ReturnType<typeof eq>[] = [];
  if (opts.clienteId) filters.push(eq(pedido.clienteId, opts.clienteId));
  if (opts.brandId) filters.push(eq(pedido.brandId, opts.brandId));
  return crudPedido.list(ctx, { filters, limit: opts.limit, offset: opts.offset });
}
