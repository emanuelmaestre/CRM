import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CrudContext } from "@/shared/lib/crud-factory";
import { db } from "@/shared/lib/db";
import { auditLog, brand, eventoDominio, produto, estoqueSaldo } from "@/shared/lib/db/schema";
import { editarProduto } from "@/modules/estoque/application/estoque.service";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL é obrigatória para o teste integrado de edição de produto.");
const orgId = process.env.DEFAULT_ORG_ID;
if (!orgId) throw new Error("DEFAULT_ORG_ID é obrigatória para o teste integrado de edição de produto.");

const ctxAdmin: CrudContext = { db, orgId, perfil: "admin" };
const ctxVendedor: CrudContext = { db, orgId, perfil: "vendedor" };

let brandId: string;
const produtosParaLimpar: string[] = [];

const criarProdutoTeste = async () => {
  const [produtoRow] = await db.insert(produto).values({
    orgId,
    brandId,
    sku: `TESTE-EDIT-${randomUUID().slice(0, 8)}`,
    nome: "Produto original",
    preco: "10.00",
    custo: "5.00",
    estoqueMinimo: 3,
  }).returning();
  await db.insert(estoqueSaldo).values({ orgId, produtoId: produtoRow.id, saldo: 20 });
  produtosParaLimpar.push(produtoRow.id);
  return produtoRow;
};

beforeAll(async () => {
  const [brandRow] = await db.select({ id: brand.id })
    .from(brand)
    .where(and(eq(brand.orgId, orgId), eq(brand.slug, "karzi")));
  if (!brandRow) throw new Error("Marca karzi não encontrada no org alvo; seed necessário antes do teste.");
  brandId = brandRow.id;
});

afterAll(async () => {
  for (const id of produtosParaLimpar) {
    await db.delete(eventoDominio).where(eq(eventoDominio.entidadeId, id)).catch(() => undefined);
    await db.delete(auditLog).where(eq(auditLog.entidadeId, id)).catch(() => undefined);
    await db.delete(estoqueSaldo).where(eq(estoqueSaldo.produtoId, id));
    await db.delete(produto).where(eq(produto.id, id));
  }
});

describe.sequential("edição de produto", () => {
  it("bloqueia vendedor de editar produto", async () => {
    const produtoRow = await criarProdutoTeste();
    await expect(editarProduto(ctxVendedor, produtoRow.id, {
      nome: "Tentativa vendedor", preco: "12.00",
    })).rejects.toThrow();
  });

  it("atualiza nome e preço, registra auditoria e emite produto.atualizado", async () => {
    const produtoRow = await criarProdutoTeste();

    const atualizado = await editarProduto(ctxAdmin, produtoRow.id, {
      nome: "Produto renomeado", preco: "15.50", custo: "6.00", estoqueMinimo: 5,
    });
    expect(atualizado).toMatchObject({ nome: "Produto renomeado", preco: "15.50" });

    const [auditoria] = await db.select().from(auditLog).where(and(
      eq(auditLog.entidade, "produto"),
      eq(auditLog.entidadeId, produtoRow.id),
      eq(auditLog.acao, "update"),
    ));
    expect(auditoria).toBeDefined();

    const eventos = await db.select().from(eventoDominio).where(and(
      eq(eventoDominio.entidade, "produto"),
      eq(eventoDominio.entidadeId, produtoRow.id),
      eq(eventoDominio.tipo, "produto.atualizado"),
    ));
    expect(eventos).toHaveLength(1);
    expect(eventos[0].payload).toMatchObject({ nome: "Produto renomeado", preco: "15.50" });
  });

  it("não emite produto.atualizado quando só custo/estoqueMinimo mudam (nome e preço iguais)", async () => {
    const produtoRow = await criarProdutoTeste();

    await editarProduto(ctxAdmin, produtoRow.id, {
      nome: produtoRow.nome, preco: produtoRow.preco, custo: "9.00", estoqueMinimo: 10,
    });

    const eventos = await db.select().from(eventoDominio).where(and(
      eq(eventoDominio.entidade, "produto"),
      eq(eventoDominio.entidadeId, produtoRow.id),
      eq(eventoDominio.tipo, "produto.atualizado"),
    ));
    expect(eventos).toHaveLength(0);

    const [linha] = await db.select().from(produto).where(eq(produto.id, produtoRow.id));
    expect(linha).toMatchObject({ custo: "9.00", estoqueMinimo: 10 });
  });

  it("rejeita editar produto inexistente ou de outra organização", async () => {
    await expect(editarProduto(ctxAdmin, randomUUID(), { nome: "Produto Novo", preco: "10.00" }))
      .rejects.toThrow(/não encontrado/);
  });

  it("rejeita preço zero ou negativo", async () => {
    const produtoRow = await criarProdutoTeste();
    await expect(editarProduto(ctxAdmin, produtoRow.id, { nome: "Produto Novo", preco: "0" })).rejects.toThrow();
    await expect(editarProduto(ctxAdmin, produtoRow.id, { nome: "Produto Novo", preco: "-5.00" })).rejects.toThrow();
  });
});
