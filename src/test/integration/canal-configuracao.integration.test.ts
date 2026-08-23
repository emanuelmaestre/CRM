import { randomUUID } from "node:crypto";
import { and, eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CrudContext } from "@/shared/lib/crud-factory";
import { db } from "@/shared/lib/db";
import { auditLog, brand, channelAccount, produto, produtoCanal } from "@/shared/lib/db/schema";
import {
  atualizarContaCanalConfiguracao,
  criarContaCanalConfiguracao,
  listarConfiguracaoCanais,
  removerContaCanalConfiguracao,
} from "@/modules/canais/application/configuracao-canais.service";
import { brandEnvSuffix } from "@/shared/config/brands";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL é obrigatória para o teste integrado de configuração de canais.");
const orgId = process.env.DEFAULT_ORG_ID;
if (!orgId) throw new Error("DEFAULT_ORG_ID é obrigatória para o teste integrado de configuração de canais.");

const ctxAdmin: CrudContext = { db, orgId, perfil: "admin" };
const ctxVendedor: CrudContext = { db, orgId, perfil: "vendedor" };

let brandId: string;
let brandSlug: string;
let brandArmarinhosId: string;
const contasParaLimpar: string[] = [];
const produtosParaLimpar: string[] = [];
const marcasParaLimpar: string[] = [];

beforeAll(async () => {
  await db.update(brand)
    .set({ active: false, updatedAt: new Date() })
    .where(and(eq(brand.orgId, orgId), like(brand.slug, "teste_canais_%")));

  brandSlug = `teste_canais_${randomUUID().slice(0, 8)}`;
  const [marcaTeste] = await db.insert(brand).values({
    orgId,
    name: "Teste integração canais",
    slug: brandSlug,
  }).returning({ id: brand.id });
  brandId = marcaTeste.id;
  marcasParaLimpar.push(marcaTeste.id);

  const [armarinhos] = await db.select({ id: brand.id }).from(brand)
    .where(and(eq(brand.orgId, orgId), eq(brand.slug, "armarinhos_lima")));
  if (!armarinhos) throw new Error("Marca armarinhos_lima não encontrada no org alvo; seed necessário antes do teste.");
  brandArmarinhosId = armarinhos.id;
});

afterAll(async () => {
  for (const id of produtosParaLimpar) {
    await db.delete(produtoCanal).where(eq(produtoCanal.produtoId, id));
    await db.delete(produto).where(eq(produto.id, id));
  }
  for (const id of contasParaLimpar) {
    await db.delete(channelAccount).where(eq(channelAccount.id, id));
  }
  for (const id of marcasParaLimpar) {
    await db.update(brand).set({ active: false, updatedAt: new Date() }).where(eq(brand.id, id));
  }
});

describe.sequential("configuração de canais — editar e remover conta", () => {
  it("atualiza nome e external account id, registrando auditoria", async () => {
    const conta = await criarContaCanalConfiguracao(ctxAdmin, {
      brandId,
      tipo: "shopee",
      nome: `Teste integracao update ${randomUUID()}`,
      externalAccountId: "seller-original",
    });
    contasParaLimpar.push(conta.id);

    await db.update(channelAccount).set({
      meta: { externalAccountId: "seller-original", customFlag: "preservar" },
    }).where(eq(channelAccount.id, conta.id));

    const atualizado = await atualizarContaCanalConfiguracao(ctxAdmin, {
      channelAccountId: conta.id,
      nome: "Nome atualizado pelo teste",
      externalAccountId: "seller-teste-123",
    });
    expect(atualizado.nome).toBe("Nome atualizado pelo teste");
    expect(atualizado.meta).toMatchObject({
      externalAccountId: "seller-teste-123",
      customFlag: "preservar",
    });

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
      tipo: "shopee",
      nome: `Teste integracao permissao ${randomUUID()}`,
      externalAccountId: "seller-permissao",
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
      tipo: "shopee",
      nome: `Teste integracao impacto ${randomUUID()}`,
      externalAccountId: "seller-impacto",
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
      tipo: "shopee",
      nome: `Teste integracao remocao ${randomUUID()}`,
      externalAccountId: "seller-remocao",
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

  it("exige ID externo e rejeita o canal WhatsApp removido", async () => {
    await expect(criarContaCanalConfiguracao(ctxAdmin, {
      brandId,
      tipo: "shopee",
      nome: "Marketplace sem ID",
    })).rejects.toThrow(/identificador externo/);

    await expect(criarContaCanalConfiguracao(ctxAdmin, {
      brandId,
      tipo: "whatsapp",
      nome: "Canal removido",
    } as never)).rejects.toThrow();
  });

  it("expõe no wizard a origem e divergência do ID externo", async () => {
    const envName = `SHOPEE_SHOP_ID_${brandEnvSuffix(brandSlug)}`;
    const anterior = process.env[envName];
    process.env[envName] = "shop-ambiente";
    const conta = await criarContaCanalConfiguracao(ctxAdmin, {
      brandId,
      tipo: "shopee",
      nome: `Shopee divergente ${randomUUID()}`,
      externalAccountId: "shop-banco",
    });
    contasParaLimpar.push(conta.id);

    try {
      const configuracao = await listarConfiguracaoCanais(ctxAdmin);
      const shopee = configuracao.find((item) => item.brandId === brandId && item.canal === "shopee");
      expect(shopee).toMatchObject({
        externalAccountId: "shop-banco",
        externalAccountIdSource: "database",
        externalAccountIdMismatch: true,
      });
    } finally {
      if (anterior === undefined) delete process.env[envName];
      else process.env[envName] = anterior;
      await db.delete(channelAccount).where(eq(channelAccount.id, conta.id));
      contasParaLimpar.splice(contasParaLimpar.indexOf(conta.id), 1);
    }
  });

  it("monta as três integrações da Armarinhos Lima a partir da configuração", async () => {
    const environment = {
      ML_SELLER_ID_ARMARINHOS_LIMA: process.env.ML_SELLER_ID_ARMARINHOS_LIMA,
      SHOPEE_SHOP_ID_ARMARINHOS_LIMA: process.env.SHOPEE_SHOP_ID_ARMARINHOS_LIMA,
      TIKTOK_SHOP_ID_ARMARINHOS_LIMA: process.env.TIKTOK_SHOP_ID_ARMARINHOS_LIMA,
    };
    process.env.ML_SELLER_ID_ARMARINHOS_LIMA = "3222790734";
    process.env.SHOPEE_SHOP_ID_ARMARINHOS_LIMA = "1824117705";
    process.env.TIKTOK_SHOP_ID_ARMARINHOS_LIMA = "BRLCXEL2YD";

    try {
      const configuracao = await listarConfiguracaoCanais(ctxAdmin);
      const armarinhos = configuracao.filter((item) => item.brandId === brandArmarinhosId);
      expect(armarinhos).toHaveLength(3);
      expect(armarinhos.find((item) => item.canal === "mercadolivre")?.externalAccountId).toBe("3222790734");
      expect(armarinhos.find((item) => item.canal === "shopee")?.externalAccountId).toBe("1824117705");
      expect(armarinhos.find((item) => item.canal === "tiktokshop")?.externalAccountId).toBe("BRLCXEL2YD");
    } finally {
      for (const [name, value] of Object.entries(environment)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });
});
