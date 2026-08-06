import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CrudContext } from "@/shared/lib/crud-factory";
import { db } from "@/shared/lib/db";
import { brand, channelAccount, estoqueDivergencia, estoqueMovimento, estoqueSaldo, produto } from "@/shared/lib/db/schema";
import {
  listarDivergenciasEstoque,
  resolverDivergenciaEstoque,
} from "@/modules/estoque/application/estoque.service";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL é obrigatória para o teste integrado de divergência de estoque.");
const orgId = process.env.DEFAULT_ORG_ID;
if (!orgId) throw new Error("DEFAULT_ORG_ID é obrigatória para o teste integrado de divergência de estoque.");

const ctxAdmin: CrudContext = { db, orgId, perfil: "admin" };
const ctxVendedor: CrudContext = { db, orgId, perfil: "vendedor" };

let brandId: string;
let channelAccountId: string;
const produtosParaLimpar: string[] = [];
const divergenciasParaLimpar: string[] = [];

const criarProdutoComSaldo = async (saldoInicial: number) => {
  const [produtoRow] = await db.insert(produto).values({
    orgId,
    brandId,
    sku: `TESTE-DIV-${randomUUID().slice(0, 8)}`,
    nome: "Produto teste divergência",
    preco: "10.00",
  }).returning();
  await db.insert(estoqueSaldo).values({ orgId, produtoId: produtoRow.id, saldo: saldoInicial });
  produtosParaLimpar.push(produtoRow.id);
  return produtoRow;
};

const criarDivergencia = async (produtoId: string, saldoLocal: number, saldoCanal: number) => {
  const [row] = await db.insert(estoqueDivergencia).values({
    orgId,
    produtoId,
    channelAccountId,
    produtoCanalId: randomUUID(),
    saldoLocal,
    saldoCanal,
  }).returning();
  divergenciasParaLimpar.push(row.id);
  return row;
};

beforeAll(async () => {
  const [brandRow] = await db.select({ id: brand.id })
    .from(brand)
    .where(and(eq(brand.orgId, orgId), eq(brand.slug, "karzi")));
  if (!brandRow) throw new Error("Marca karzi não encontrada no org alvo; seed necessário antes do teste.");
  brandId = brandRow.id;

  const [conta] = await db.select({ id: channelAccount.id }).from(channelAccount)
    .where(and(eq(channelAccount.orgId, orgId), eq(channelAccount.brandId, brandId), eq(channelAccount.tipo, "mercadolivre")));
  if (!conta) throw new Error("Conta Mercado Livre da karzi não encontrada; seed necessário antes do teste.");
  channelAccountId = conta.id;
});

afterAll(async () => {
  for (const id of divergenciasParaLimpar) {
    await db.delete(estoqueDivergencia).where(eq(estoqueDivergencia.id, id)).catch(() => undefined);
  }
  for (const id of produtosParaLimpar) {
    await db.delete(estoqueMovimento).where(eq(estoqueMovimento.produtoId, id));
    await db.delete(estoqueSaldo).where(eq(estoqueSaldo.produtoId, id));
    await db.delete(produto).where(eq(produto.id, id));
  }
});

describe.sequential("divergência de estoque — listar e resolver", () => {
  it("lista apenas divergências pendentes da organização", async () => {
    const produtoRow = await criarProdutoComSaldo(10);
    const divergencia = await criarDivergencia(produtoRow.id, 10, 7);

    const lista = await listarDivergenciasEstoque(ctxAdmin);
    const encontrada = lista.find((item) => item.id === divergencia.id);
    expect(encontrada).toMatchObject({
      produtoId: produtoRow.id,
      saldoLocal: 10,
      saldoCanal: 7,
      canal: "mercadolivre",
    });
  });

  it("bloqueia vendedor de listar ou resolver divergências", async () => {
    await expect(listarDivergenciasEstoque(ctxVendedor)).rejects.toThrow();
    await expect(resolverDivergenciaEstoque(ctxVendedor, randomUUID(), "ignorar")).rejects.toThrow();
  });

  it("aplicar_canal atualiza o saldo, registra ajuste e marca a divergência como aplicada", async () => {
    const produtoRow = await criarProdutoComSaldo(10);
    const divergencia = await criarDivergencia(produtoRow.id, 10, 7);

    const resultado = await resolverDivergenciaEstoque(ctxAdmin, divergencia.id, "aplicar_canal");
    expect(resultado).toMatchObject({ status: "aplicada", novoSaldo: 7 });

    const [saldoAtual] = await db.select().from(estoqueSaldo).where(eq(estoqueSaldo.produtoId, produtoRow.id));
    expect(saldoAtual.saldo).toBe(7);

    const [movimento] = await db.select().from(estoqueMovimento).where(and(
      eq(estoqueMovimento.produtoId, produtoRow.id),
      eq(estoqueMovimento.referenciaTipo, "reconciliacao_estoque"),
    ));
    expect(movimento).toMatchObject({ tipo: "ajuste", quantidade: 7, referenciaId: divergencia.id });

    const [divergenciaAtual] = await db.select().from(estoqueDivergencia).where(eq(estoqueDivergencia.id, divergencia.id));
    expect(divergenciaAtual.status).toBe("aplicada");
    expect(divergenciaAtual.resolvidoEm).not.toBeNull();
  });

  it("aplicar_canal aceita saldo zero (anúncio esgotado) sem violar a constraint de quantidade positiva", async () => {
    const produtoRow = await criarProdutoComSaldo(5);
    const divergencia = await criarDivergencia(produtoRow.id, 5, 0);

    const resultado = await resolverDivergenciaEstoque(ctxAdmin, divergencia.id, "aplicar_canal");
    expect(resultado).toMatchObject({ status: "aplicada", novoSaldo: 0 });

    const [saldoAtual] = await db.select().from(estoqueSaldo).where(eq(estoqueSaldo.produtoId, produtoRow.id));
    expect(saldoAtual.saldo).toBe(0);

    // quantidade=0 violaria chk_movimento_quantidade_positiva — nenhuma linha de movimento é criada nesse caso.
    const movimentos = await db.select().from(estoqueMovimento).where(and(
      eq(estoqueMovimento.produtoId, produtoRow.id),
      eq(estoqueMovimento.referenciaTipo, "reconciliacao_estoque"),
    ));
    expect(movimentos).toHaveLength(0);
  });

  it("ignorar marca a divergência como ignorada sem tocar no saldo", async () => {
    const produtoRow = await criarProdutoComSaldo(10);
    const divergencia = await criarDivergencia(produtoRow.id, 10, 3);

    const resultado = await resolverDivergenciaEstoque(ctxAdmin, divergencia.id, "ignorar");
    expect(resultado).toEqual({ status: "ignorada", eventoSaldo: null });

    const [saldoAtual] = await db.select().from(estoqueSaldo).where(eq(estoqueSaldo.produtoId, produtoRow.id));
    expect(saldoAtual.saldo).toBe(10);

    const [divergenciaAtual] = await db.select().from(estoqueDivergencia).where(eq(estoqueDivergencia.id, divergencia.id));
    expect(divergenciaAtual.status).toBe("ignorada");
  });

  it("rejeita resolver uma divergência já resolvida", async () => {
    const produtoRow = await criarProdutoComSaldo(10);
    const divergencia = await criarDivergencia(produtoRow.id, 10, 3);
    await resolverDivergenciaEstoque(ctxAdmin, divergencia.id, "ignorar");

    await expect(resolverDivergenciaEstoque(ctxAdmin, divergencia.id, "aplicar_canal"))
      .rejects.toThrow(/não encontrada ou já resolvida/);
  });

  it("impede duas divergências pendentes simultâneas para o mesmo mapeamento produto-canal", async () => {
    const produtoRow = await criarProdutoComSaldo(10);
    const produtoCanalId = randomUUID();
    const [primeira] = await db.insert(estoqueDivergencia).values({
      orgId, produtoId: produtoRow.id, channelAccountId, produtoCanalId, saldoLocal: 10, saldoCanal: 8,
    }).returning();
    divergenciasParaLimpar.push(primeira.id);

    await expect(db.insert(estoqueDivergencia).values({
      orgId, produtoId: produtoRow.id, channelAccountId, produtoCanalId, saldoLocal: 10, saldoCanal: 6,
    })).rejects.toThrow();
  });
});
