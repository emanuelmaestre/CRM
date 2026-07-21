import { eq, and, isNull } from "drizzle-orm";
import { createCrudFactory, type CrudContext } from "@/shared/lib/crud-factory";
import { db } from "@/shared/lib/db";
import { produto, estoqueSaldo, estoqueMovimento } from "@/shared/lib/db/schema";
import { emitirEvento } from "@/shared/events";
import { validarMovimento, calcularNovoSaldo, type MovimentoTipo, CreateProdutoSchema } from "../domain/entities";

const crudProduto = createCrudFactory({
  table: produto,
  entityName: "produto",
  softDelete: true,
  allowedPerfis: {
    create: ["admin", "gestor"],
    update: ["admin", "gestor"],
    delete: ["admin"],
    read: ["admin", "gestor", "vendedor"],
  },
});

export async function criarProduto(ctx: CrudContext, input: unknown) {
  const data = CreateProdutoSchema.parse(input);
  const novo = await crudProduto.create(ctx, data as Record<string, unknown>);

  await db.insert(estoqueSaldo).values({
    orgId: ctx.orgId,
    produtoId: (novo as { id: string }).id,
    saldo: 0,
  });

  return novo;
}

export async function listarProdutos(ctx: CrudContext, opts: { brandId?: string; limit?: number; offset?: number } = {}) {
  const filters = [];
  if (opts.brandId) {
    const { eq: eqFn } = await import("drizzle-orm");
    filters.push(eqFn(produto.brandId, opts.brandId));
  }
  return crudProduto.list(ctx, { filters, limit: opts.limit, offset: opts.offset });
}

export async function registrarMovimento(
  ctx: CrudContext,
  input: {
    produtoId: string;
    tipo: MovimentoTipo;
    quantidade: number;
    referenciaId?: string;
    referenciaTipo?: string;
    observacao?: string;
  }
) {
  const saldoRow = await db
    .select()
    .from(estoqueSaldo)
    .where(eq(estoqueSaldo.produtoId, input.produtoId))
    .then((r) => r[0]);

  if (!saldoRow) throw new Error("Produto sem saldo cadastrado.");

  validarMovimento(saldoRow.saldo, input.tipo, input.quantidade);
  const novoSaldo = calcularNovoSaldo(saldoRow.saldo, input.tipo, input.quantidade);

  const [movimento] = await db
    .insert(estoqueMovimento)
    .values({
      orgId: ctx.orgId,
      produtoId: input.produtoId,
      tipo: input.tipo,
      quantidade: input.quantidade,
      referenciaId: input.referenciaId,
      referenciaTipo: input.referenciaTipo,
      observacao: input.observacao,
    })
    .returning();

  await db
    .update(estoqueSaldo)
    .set({ saldo: novoSaldo, updatedAt: new Date() })
    .where(eq(estoqueSaldo.produtoId, input.produtoId));

  await emitirEvento({
    tipo: "estoque.baixa_automatica",
    orgId: ctx.orgId,
    entidade: "estoque_movimento",
    entidadeId: movimento.id,
    payload: { produtoId: input.produtoId, tipo: input.tipo, quantidade: input.quantidade, novoSaldo },
  });

  const produtoRow = await db.select().from(produto).where(eq(produto.id, input.produtoId)).then((r) => r[0]);
  if (produtoRow && novoSaldo <= produtoRow.estoqueMinimo) {
    await emitirEvento({
      tipo: "estoque.minimo_atingido",
      orgId: ctx.orgId,
      entidade: "produto",
      entidadeId: input.produtoId,
      payload: { sku: produtoRow.sku, saldoAtual: novoSaldo, minimo: produtoRow.estoqueMinimo },
    });
  }

  return { movimento, novoSaldo };
}

export async function consultarSaldo(ctx: CrudContext, produtoId: string) {
  return db
    .select()
    .from(estoqueSaldo)
    .where(eq(estoqueSaldo.produtoId, produtoId))
    .then((r) => r[0] ?? null);
}
