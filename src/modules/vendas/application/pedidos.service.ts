import { eq, and } from "drizzle-orm";
import { assertPerfil, createCrudFactory, type CrudContext } from "@/shared/lib/crud-factory";
import { db } from "@/shared/lib/db";
import { pedido, pedidoItem } from "@/shared/lib/db/schema";
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
