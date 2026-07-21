import { and, eq } from "drizzle-orm";
import { assertPerfil, createCrudFactory, type CrudContext } from "@/shared/lib/crud-factory";
import { db } from "@/shared/lib/db";
import { produto, estoqueSaldo, estoqueMovimento } from "@/shared/lib/db/schema";
import { despacharEvento, persistirEvento } from "@/shared/events";
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
  assertPerfil(ctx, ["admin", "gestor"]);

  const resultado = await ctx.db.transaction(async (tx) => {
    const saldoRow = await tx
      .select()
      .from(estoqueSaldo)
      .where(and(
        eq(estoqueSaldo.orgId, ctx.orgId),
        eq(estoqueSaldo.produtoId, input.produtoId),
      ))
      .for("update")
      .then((rows) => rows[0]);

    if (!saldoRow) throw new Error("Produto sem saldo cadastrado.");

    // O lock do saldo serializa consumidores concorrentes do mesmo produto.
    // A checagem após o lock enxerga o movimento confirmado pelo primeiro job.
    if (input.referenciaId && input.referenciaTipo) {
      const existente = await tx
        .select()
        .from(estoqueMovimento)
        .where(and(
          eq(estoqueMovimento.orgId, ctx.orgId),
          eq(estoqueMovimento.produtoId, input.produtoId),
          eq(estoqueMovimento.referenciaId, input.referenciaId),
          eq(estoqueMovimento.referenciaTipo, input.referenciaTipo),
        ))
        .then((rows) => rows[0]);

      if (existente) {
        return { movimento: existente, novoSaldo: saldoRow.saldo, idempotente: true, evento: null };
      }
    }

    validarMovimento(saldoRow.saldo, input.tipo, input.quantidade);
    const novoSaldo = calcularNovoSaldo(saldoRow.saldo, input.tipo, input.quantidade);

    const [movimento] = await tx
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

    await tx
      .update(estoqueSaldo)
      .set({ saldo: novoSaldo, updatedAt: new Date() })
      .where(and(
        eq(estoqueSaldo.orgId, ctx.orgId),
        eq(estoqueSaldo.produtoId, input.produtoId),
      ));

    const evento = input.tipo === "saida"
      ? await persistirEvento({
          tipo: "estoque.baixa_automatica",
          orgId: ctx.orgId,
          entidade: "estoque_movimento",
          entidadeId: movimento.id,
          payload: { produtoId: input.produtoId, tipo: input.tipo, quantidade: input.quantidade, novoSaldo },
        }, tx)
      : null;

    return { movimento, novoSaldo, idempotente: false, evento };
  });

  if (resultado.evento) await despacharEvento(resultado.evento);

  return {
    movimento: resultado.movimento,
    novoSaldo: resultado.novoSaldo,
    idempotente: resultado.idempotente,
  };
}

export async function consultarSaldo(ctx: CrudContext, produtoId: string) {
  return ctx.db
    .select()
    .from(estoqueSaldo)
    .where(and(eq(estoqueSaldo.orgId, ctx.orgId), eq(estoqueSaldo.produtoId, produtoId)))
    .then((r) => r[0] ?? null);
}
