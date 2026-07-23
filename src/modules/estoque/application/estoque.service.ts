import { and, count, eq, ilike, isNull, SQL, sql } from "drizzle-orm";
import { assertPerfil, type CrudContext } from "@/shared/lib/crud-factory";
import { auditLog, brand, produto, estoqueSaldo, estoqueMovimento } from "@/shared/lib/db/schema";
import { despacharEvento, persistirEvento } from "@/shared/events";
import { validarMovimento, calcularNovoSaldo, type MovimentoTipo, CreateProdutoSchema } from "../domain/entities";

export async function criarProduto(ctx: CrudContext, input: unknown) {
  const data = CreateProdutoSchema.parse(input);
  assertPerfil(ctx, ["admin", "gestor"]);

  const marcaValida = await ctx.db
    .select({ id: brand.id })
    .from(brand)
    .where(and(eq(brand.id, data.brandId), eq(brand.orgId, ctx.orgId), eq(brand.active, true)))
    .then((rows) => rows[0]);
  if (!marcaValida) throw new Error("Marca não pertence à organização.");

  const novo = await ctx.db.transaction(async (tx) => {
    const [created] = await tx.insert(produto).values({ ...data, orgId: ctx.orgId }).returning();
    await tx.insert(estoqueSaldo).values({ orgId: ctx.orgId, produtoId: created.id, saldo: 0 });
    await tx.insert(auditLog).values({
      orgId: ctx.orgId,
      brandId: created.brandId,
      autorId: ctx.userId,
      autorTipo: ctx.userId ? "usuario" : "sistema",
      entidade: "produto",
      entidadeId: created.id,
      acao: "create",
      depois: created,
    });
    await persistirEvento({
      tipo: "produto.criado",
      orgId: ctx.orgId,
      brandId: created.brandId,
      entidade: "produto",
      entidadeId: created.id,
      payload: { sku: created.sku, nome: created.nome },
    }, tx);
    return created;
  });

  return novo;
}

export async function listarProdutos(
  ctx: CrudContext,
  opts: { brandId?: string; busca?: string; limit?: number; offset?: number } = {},
) {
  assertPerfil(ctx, ["admin", "gestor", "vendedor"]);
  const { limit = 50, offset = 0 } = opts;
  const filters: SQL[] = [eq(produto.orgId, ctx.orgId), isNull(produto.deletedAt)];
  if (opts.brandId) filters.push(eq(produto.brandId, opts.brandId));
  if (opts.busca) filters.push(ilike(sql`${produto.sku} || ' ' || ${produto.nome}`, `%${opts.busca}%`));

  const [rows, totalRows] = await Promise.all([
    ctx.db
      .select({
        id: produto.id,
        orgId: produto.orgId,
        brandId: produto.brandId,
        sku: produto.sku,
        nome: produto.nome,
        custo: produto.custo,
        preco: produto.preco,
        estoqueMinimo: produto.estoqueMinimo,
        ativo: produto.ativo,
        createdAt: produto.createdAt,
        updatedAt: produto.updatedAt,
        saldo: sql<number>`coalesce(${estoqueSaldo.saldo}, 0)`,
      })
      .from(produto)
      .leftJoin(estoqueSaldo, and(
        eq(estoqueSaldo.produtoId, produto.id),
        eq(estoqueSaldo.orgId, ctx.orgId),
      ))
      .where(and(...filters))
      .orderBy(produto.nome)
      .limit(limit)
      .offset(offset),
    ctx.db.select({ total: count() }).from(produto).where(and(...filters)),
  ]);

  return { data: rows, total: totalRows[0]?.total ?? 0, limit, offset };
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
    const produtoRow = await tx
      .select({ id: produto.id, brandId: produto.brandId, estoqueMinimo: produto.estoqueMinimo })
      .from(produto)
      .where(and(eq(produto.orgId, ctx.orgId), eq(produto.id, input.produtoId), isNull(produto.deletedAt)))
      .then((rows) => rows[0]);
    if (!produtoRow) throw new Error("Produto não encontrado.");

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
        return {
          movimento: existente, novoSaldo: saldoRow.saldo, idempotente: true,
          eventoBaixa: null, eventoSaldo: null, eventoMinimo: null,
        };
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

    await tx.insert(auditLog).values({
      orgId: ctx.orgId,
      brandId: produtoRow.brandId,
      autorId: ctx.userId,
      autorTipo: ctx.userId ? "usuario" : "sistema",
      entidade: "estoque_movimento",
      entidadeId: movimento.id,
      acao: "registrado",
      depois: movimento,
    });

    await tx
      .update(estoqueSaldo)
      .set({ saldo: novoSaldo, updatedAt: new Date() })
      .where(and(
        eq(estoqueSaldo.orgId, ctx.orgId),
        eq(estoqueSaldo.produtoId, input.produtoId),
      ));

    const eventoBaixa = input.tipo === "saida"
      ? await persistirEvento({
          tipo: "estoque.baixa_automatica",
          orgId: ctx.orgId,
          entidade: "estoque_movimento",
          entidadeId: movimento.id,
          payload: { produtoId: input.produtoId, tipo: input.tipo, quantidade: input.quantidade, novoSaldo },
        }, tx)
      : null;

    // Emitido para qualquer tipo de movimento — permite A4 sincronizar o saldo nos canais.
    const eventoSaldo = await persistirEvento({
      tipo: "estoque.saldo_atualizado",
      orgId: ctx.orgId,
      entidade: "estoque_saldo",
      entidadeId: input.produtoId,
      payload: { produtoId: input.produtoId, novoSaldo, tipoMovimento: input.tipo },
    }, tx);

    await persistirEvento({
      tipo: "estoque.movimento_registrado",
      orgId: ctx.orgId,
      brandId: produtoRow.brandId,
      entidade: "estoque_movimento",
      entidadeId: movimento.id,
      payload: { produtoId: input.produtoId, tipo: input.tipo, quantidade: input.quantidade, novoSaldo },
    }, tx);

    const eventoMinimo = saldoRow.saldo > produtoRow.estoqueMinimo && novoSaldo <= produtoRow.estoqueMinimo
      ? await persistirEvento({
          tipo: "estoque.minimo_atingido",
          orgId: ctx.orgId,
          brandId: produtoRow.brandId,
          entidade: "produto",
          entidadeId: produtoRow.id,
          payload: { produtoId: produtoRow.id, estoqueMinimo: produtoRow.estoqueMinimo, novoSaldo },
        }, tx)
      : null;

    return { movimento, novoSaldo, idempotente: false, eventoBaixa, eventoSaldo, eventoMinimo };
  });

  if (resultado.eventoBaixa) await despacharEvento(resultado.eventoBaixa);
  if (resultado.eventoSaldo) await despacharEvento(resultado.eventoSaldo);
  if (resultado.eventoMinimo) await despacharEvento(resultado.eventoMinimo);

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
