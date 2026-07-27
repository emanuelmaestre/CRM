import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CrudContext } from "@/shared/lib/crud-factory";
import { db } from "@/shared/lib/db";
import { auditLog, brand, channelAccount, produto, produtoCanal } from "@/shared/lib/db/schema";
import {
  atualizarContaCanalConfiguracao,
  criarContaCanalConfiguracao,
  removerContaCanalConfiguracao,
} from "@/modules/canais/application/configuracao-canais.service";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL é obrigatória para o teste integrado de configuração de canais.");
const orgId = process.env.DEFAULT_ORG_ID;
if (!orgId) throw new Error("DEFAULT_ORG_ID é obrigatória para o teste integrado de configuração de canais.");

const ctxAdmin: CrudContext = { db, orgId, perfil: "admin" };
const ctxVendedor: CrudContext = { db, orgId, perfil: "vendedor" };

let brandId: string;
const contasParaLimpar: string[] = [];
const produtosParaLimpar: string[] = [];

beforeAll(async () => {
  const [karzi] = await db.select({ id: brand.id }).from(brand)
    .where(and(eq(brand.orgId, orgId), eq(brand.slug, "karzi")));
  if (!karzi) throw new Error("Marca karzi não encontrada no org alvo; seed necessário antes do teste.");
  brandId = karzi.id;
});

afterAll(async () => {
  for (const id of produtosParaLimpar) {
    await db.delete(produtoCanal).where(eq(produtoCanal.produtoId, id));
    await db.delete(produto).where(eq(produto.id, id));
  }
  for (const id of contasParaLimpar) {
    await db.delete(channelAccount).where(eq(channelAccount.id, id));
  }
});

describe.sequential("configuração de canais — editar e remover conta", () => {
  it("atualiza nome e external account id, registrando auditoria", async () => {
    const conta = await criarContaCanalConfiguracao(ctxAdmin, {
      brandId,
      tipo: "olist",
      nome: `Teste integracao update ${randomUUID()}`,
    });
    contasParaLimpar.push(conta.id);

    const atualizado = await atualizarContaCanalConfiguracao(ctxAdmin, {
      channelAccountId: conta.id,
      nome: "Nome atualizado pelo teste",
      externalAccountId: "seller-teste-123",
    });
    expect(atualizado.nome).toBe("Nome atualizado pelo teste");

    const [auditoria] = await db.select().from(auditLog).where(and(
      eq(auditLog.entidade, "channel_account"),
      eq(auditLog.entidadeId, conta.id),
      eq(auditLog.acao, "update"),
    ));
    expect(auditoria).toBeDefined();

    await db.delete(channelAccount).where(eq(channelAccount.id, conta.id));
    contasParaLimpar.splice(contasParaLimpar.indexOf(conta.id), 1);
  });

  it("bloqueia edição e remoção para perfil sem permissão", async () => {
    const conta = await criarContaCanalConfiguracao(ctxAdmin, {
      brandId,
      tipo: "olist",
      nome: `Teste integracao permissao ${randomUUID()}`,
    });
    contasParaLimpar.push(conta.id);

    await expect(atualizarContaCanalConfiguracao(ctxVendedor, {
      channelAccountId: conta.id,
      nome: "Tentativa vendedor",
    })).rejects.toThrow();

    await expect(removerContaCanalConfiguracao(ctxVendedor, {
      channelAccountId: conta.id,
    })).rejects.toThrow();

    await db.delete(channelAccount).where(eq(channelAccount.id, conta.id));
    contasParaLimpar.splice(contasParaLimpar.indexOf(conta.id), 1);
  });

  it("impede remoção quando há mapeamento de SKU vinculado", async () => {
    const conta = await criarContaCanalConfiguracao(ctxAdmin, {
      brandId,
      tipo: "olist",
      nome: `Teste integracao impacto ${randomUUID()}`,
    });
    contasParaLimpar.push(conta.id);

    const [produtoTeste] = await db.insert(produto).values({
      orgId,
      brandId,
      sku: `TESTE-INT-${randomUUID().slice(0, 8)}`,
      nome: "Produto teste integracao canais",
      preco: "10.00",
    }).returning();
    produtosParaLimpar.push(produtoTeste.id);

    await db.insert(produtoCanal).values({
      orgId,
      produtoId: produtoTeste.id,
      channelAccountId: conta.id,
      externalListingId: "listing-teste-integracao",
      ativo: true,
    });

    await expect(removerContaCanalConfiguracao(ctxAdmin, {
      channelAccountId: conta.id,
    })).rejects.toThrow(/mapeamento/);

    await db.delete(produtoCanal).where(eq(produtoCanal.channelAccountId, conta.id));
    await db.delete(produto).where(eq(produto.id, produtoTeste.id));
    produtosParaLimpar.splice(produtosParaLimpar.indexOf(produtoTeste.id), 1);

    await db.delete(channelAccount).where(eq(channelAccount.id, conta.id));
    contasParaLimpar.splice(contasParaLimpar.indexOf(conta.id), 1);
  });

  it("remove conta sem dependências e registra auditoria", async () => {
    const conta = await criarContaCanalConfiguracao(ctxAdmin, {
      brandId,
      tipo: "olist",
      nome: `Teste integracao remocao ${randomUUID()}`,
    });

    const resultado = await removerContaCanalConfiguracao(ctxAdmin, { channelAccountId: conta.id });
    expect(resultado.removido).toBe(true);

    const [restante] = await db.select({ id: channelAccount.id }).from(channelAccount)
      .where(eq(channelAccount.id, conta.id));
    expect(restante).toBeUndefined();

    const [auditoria] = await db.select().from(auditLog).where(and(
      eq(auditLog.entidade, "channel_account"),
      eq(auditLog.entidadeId, conta.id),
      eq(auditLog.acao, "delete"),
    ));
    expect(auditoria).toBeDefined();
  });
});
