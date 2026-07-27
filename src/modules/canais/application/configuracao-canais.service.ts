import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { assertPerfil, type CrudContext } from "@/shared/lib/crud-factory";
import {
  auditLog,
  brand,
  channelAccount,
  conversa,
  pedido,
  produto,
  produtoCanal,
} from "@/shared/lib/db/schema";

const CANAIS_PRIORITARIOS = [
  "whatsapp",
  "mercadolivre",
  "shopee",
  "tiktokshop",
  "olist",
] as const;

const CANAL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  mercadolivre: "Mercado Livre",
  shopee: "Shopee",
  tiktokshop: "TikTok Shop",
  olist: "Olist",
};

const ENV_POR_CANAL: Record<string, string[]> = {
  whatsapp: ["ZAPI_INSTANCE_{BRAND}", "ZAPI_TOKEN_{BRAND}", "ZAPI_WEBHOOK_TOKEN_{BRAND}"],
  mercadolivre: ["ML_CLIENT_ID", "ML_CLIENT_SECRET"],
  shopee: ["SHOPEE_PARTNER_ID", "SHOPEE_PARTNER_KEY", "SHOPEE_SHOP_ID_{BRAND}", "SHOPEE_ACCESS_TOKEN_{BRAND}"],
  tiktokshop: ["TIKTOK_APP_KEY", "TIKTOK_APP_SECRET", "TIKTOK_SHOP_ID_{BRAND}", "TIKTOK_SHOP_CIPHER_{BRAND}", "TIKTOK_ACCESS_TOKEN_{BRAND}"],
  olist: ["OLIST_ID_TOKEN_{BRAND}", "OLIST_SELLER_ID_{BRAND}", "OLIST_WEBHOOK_SECRET"],
};

function envName(template: string, brandSlug: string) {
  return template.replace("{BRAND}", brandSlug.toUpperCase());
}

function configured(name: string): boolean {
  const value = process.env[name]?.trim();
  return Boolean(value && !/^(your-|replace-|changeme|placeholder)/i.test(value));
}

export interface CanalConfiguracao {
  id: string;
  channelAccountId: string | null;
  canal: string;
  canalLabel: string;
  brand: "karzi" | "wuwu";
  brandId: string;
  brandLabel: string;
  status: "conectado" | "degradado" | "desconectado" | "pendente";
  contaNome: string | null;
  ultimaVerificacao: string | null;
  ultimoErro: string | null;
  skusMapeados: number;
  envAusentes: string[];
  pronto: boolean;
  externalAccountId: string | null;
}

const ContaCanalInputSchema = z.object({
  brandId: z.string().uuid(),
  tipo: z.enum(["whatsapp", "mercadolivre", "shopee", "tiktokshop", "olist"]),
  nome: z.string().trim().min(2).max(120),
  externalAccountId: z.string().trim().max(200).optional(),
});

const AtualizarContaCanalInputSchema = z.object({
  channelAccountId: z.string().uuid(),
  nome: z.string().trim().min(2).max(120),
  externalAccountId: z.string().trim().max(200).optional(),
});

const RemoverContaCanalInputSchema = z.object({
  channelAccountId: z.string().uuid(),
});

const MapeamentoInputSchema = z.object({
  produtoId: z.string().uuid(),
  channelAccountId: z.string().uuid(),
  externalListingId: z.string().trim().min(1).max(200),
  externalSkuId: z.string().trim().max(200).optional(),
  externalWarehouseId: z.string().trim().max(200).optional(),
});

function normalizeBrand(value: string): "karzi" | "wuwu" {
  return value === "wuwu" ? "wuwu" : "karzi";
}

function extrairExternalAccountId(meta: unknown): string | null {
  if (meta && typeof meta === "object" && "externalAccountId" in meta) {
    const value = (meta as { externalAccountId?: unknown }).externalAccountId;
    return typeof value === "string" && value.length > 0 ? value : null;
  }
  return null;
}

export async function listarConfiguracaoCanais(ctx: CrudContext): Promise<CanalConfiguracao[]> {
  const [marcas, contas, mapeamentos] = await Promise.all([
    ctx.db
      .select({ id: brand.id, slug: brand.slug, name: brand.name })
      .from(brand)
      .where(and(eq(brand.orgId, ctx.orgId), eq(brand.active, true))),
    ctx.db
      .select({
        id: channelAccount.id,
        brandId: channelAccount.brandId,
        tipo: channelAccount.tipo,
        nome: channelAccount.nome,
        status: channelAccount.status,
        ultimaVerificacao: channelAccount.ultimaVerificacao,
        ultimoErro: channelAccount.ultimoErro,
        meta: channelAccount.meta,
      })
      .from(channelAccount)
      .where(eq(channelAccount.orgId, ctx.orgId)),
    ctx.db
      .select({
        channelAccountId: produtoCanal.channelAccountId,
      })
      .from(produtoCanal)
      .where(and(eq(produtoCanal.orgId, ctx.orgId), eq(produtoCanal.ativo, true))),
  ]);

  const skusPorConta = new Map<string, number>();
  for (const item of mapeamentos) {
    skusPorConta.set(item.channelAccountId, (skusPorConta.get(item.channelAccountId) ?? 0) + 1);
  }

  return marcas.flatMap((marca) => CANAIS_PRIORITARIOS.map((canal) => {
    const conta = contas.find((item) => item.brandId === marca.id && item.tipo === canal);
    const envAusentes = (ENV_POR_CANAL[canal] ?? [])
      .map((template) => envName(template, marca.slug))
      .filter((name) => !configured(name));
    const skusMapeados = conta ? skusPorConta.get(conta.id) ?? 0 : 0;
    const status = conta?.status ?? "pendente";

    return {
      id: `${marca.slug}-${canal}`,
      channelAccountId: conta?.id ?? null,
      canal,
      canalLabel: CANAL_LABEL[canal] ?? canal,
      brand: normalizeBrand(marca.slug),
      brandId: marca.id,
      brandLabel: marca.name,
      status,
      contaNome: conta?.nome ?? null,
      ultimaVerificacao: conta?.ultimaVerificacao?.toISOString() ?? null,
      ultimoErro: conta?.ultimoErro ?? null,
      externalAccountId: conta ? extrairExternalAccountId(conta.meta) : null,
      skusMapeados,
      envAusentes,
      pronto: status === "conectado" && envAusentes.length === 0 && (canal === "whatsapp" || skusMapeados > 0),
    };
  }));
}

export async function criarContaCanalConfiguracao(ctx: CrudContext, input: unknown) {
  assertPerfil(ctx, ["admin", "gestor"]);
  const data = ContaCanalInputSchema.parse(input);
  const marca = await ctx.db
    .select({ id: brand.id, slug: brand.slug })
    .from(brand)
    .where(and(eq(brand.id, data.brandId), eq(brand.orgId, ctx.orgId), eq(brand.active, true)))
    .then((rows) => rows[0]);
  if (!marca) throw new Error("Marca nao pertence a organizacao.");

  const existente = await ctx.db
    .select({ id: channelAccount.id })
    .from(channelAccount)
    .where(and(
      eq(channelAccount.orgId, ctx.orgId),
      eq(channelAccount.brandId, data.brandId),
      eq(channelAccount.tipo, data.tipo),
    ))
    .then((rows) => rows[0]);
  if (existente) throw new Error("Ja existe uma conta deste canal para esta marca.");

  const [conta] = await ctx.db.insert(channelAccount).values({
    orgId: ctx.orgId,
    brandId: data.brandId,
    tipo: data.tipo,
    nome: data.nome,
    status: "desconectado",
    vaultKey: `env:${data.tipo}:${marca.slug}`,
    meta: data.externalAccountId ? { externalAccountId: data.externalAccountId } : undefined,
  }).returning();

  await ctx.db.insert(auditLog).values({
    orgId: ctx.orgId,
    brandId: data.brandId,
    autorId: ctx.userId,
    autorTipo: ctx.userId ? "usuario" : "sistema",
    entidade: "channel_account",
    entidadeId: conta.id,
    acao: "create",
    depois: { id: conta.id, tipo: conta.tipo, nome: conta.nome, status: conta.status },
  });

  return conta;
}

export async function atualizarContaCanalConfiguracao(ctx: CrudContext, input: unknown) {
  assertPerfil(ctx, ["admin", "gestor"]);
  const data = AtualizarContaCanalInputSchema.parse(input);

  const contaAtual = await ctx.db
    .select({
      id: channelAccount.id,
      brandId: channelAccount.brandId,
      nome: channelAccount.nome,
      meta: channelAccount.meta,
    })
    .from(channelAccount)
    .where(and(eq(channelAccount.id, data.channelAccountId), eq(channelAccount.orgId, ctx.orgId)))
    .then((rows) => rows[0]);
  if (!contaAtual) throw new Error("Conta de canal nao encontrada.");

  const novoMeta = data.externalAccountId ? { externalAccountId: data.externalAccountId } : null;

  const [conta] = await ctx.db.update(channelAccount)
    .set({ nome: data.nome, meta: novoMeta, updatedAt: new Date() })
    .where(and(eq(channelAccount.id, data.channelAccountId), eq(channelAccount.orgId, ctx.orgId)))
    .returning();

  await ctx.db.insert(auditLog).values({
    orgId: ctx.orgId,
    brandId: contaAtual.brandId,
    autorId: ctx.userId,
    autorTipo: ctx.userId ? "usuario" : "sistema",
    entidade: "channel_account",
    entidadeId: conta.id,
    acao: "update",
    antes: { nome: contaAtual.nome, meta: contaAtual.meta },
    depois: { nome: conta.nome, meta: conta.meta },
  });

  return conta;
}

export async function removerContaCanalConfiguracao(ctx: CrudContext, input: unknown) {
  assertPerfil(ctx, ["admin", "gestor"]);
  const data = RemoverContaCanalInputSchema.parse(input);

  const conta = await ctx.db
    .select({
      id: channelAccount.id,
      brandId: channelAccount.brandId,
      tipo: channelAccount.tipo,
      nome: channelAccount.nome,
      status: channelAccount.status,
    })
    .from(channelAccount)
    .where(and(eq(channelAccount.id, data.channelAccountId), eq(channelAccount.orgId, ctx.orgId)))
    .then((rows) => rows[0]);
  if (!conta) throw new Error("Conta de canal nao encontrada.");

  const [mapeamentos, pedidosVinculados, conversasVinculadas] = await Promise.all([
    ctx.db.select({ id: produtoCanal.id }).from(produtoCanal)
      .where(eq(produtoCanal.channelAccountId, data.channelAccountId)),
    ctx.db.select({ id: pedido.id }).from(pedido)
      .where(eq(pedido.channelAccountId, data.channelAccountId)).limit(1),
    ctx.db.select({ id: conversa.id }).from(conversa)
      .where(eq(conversa.channelAccountId, data.channelAccountId)).limit(1),
  ]);

  const impedimentos: string[] = [];
  if (mapeamentos.length > 0) impedimentos.push(`${mapeamentos.length} mapeamento(s) de SKU`);
  if (pedidosVinculados.length > 0) impedimentos.push("pedidos historicos");
  if (conversasVinculadas.length > 0) impedimentos.push("conversas de inbox");

  if (impedimentos.length > 0) {
    throw new Error(
      `Nao e possivel remover: existem ${impedimentos.join(", ")} vinculados a esta conta. `
      + "Remova os mapeamentos de SKU antes de excluir a conta; contas com pedidos ou conversas nao podem ser excluidas.",
    );
  }

  await ctx.db.delete(channelAccount)
    .where(and(eq(channelAccount.id, data.channelAccountId), eq(channelAccount.orgId, ctx.orgId)));

  await ctx.db.insert(auditLog).values({
    orgId: ctx.orgId,
    brandId: conta.brandId,
    autorId: ctx.userId,
    autorTipo: ctx.userId ? "usuario" : "sistema",
    entidade: "channel_account",
    entidadeId: conta.id,
    acao: "delete",
    antes: { tipo: conta.tipo, nome: conta.nome, status: conta.status },
  });

  return { removido: true };
}

export async function salvarMapeamentoCanalConfiguracao(ctx: CrudContext, input: unknown) {
  assertPerfil(ctx, ["admin", "gestor"]);
  const data = MapeamentoInputSchema.parse(input);

  const [produtoRow, contaRow] = await Promise.all([
    ctx.db.select({ id: produto.id, brandId: produto.brandId }).from(produto).where(and(
      eq(produto.id, data.produtoId),
      eq(produto.orgId, ctx.orgId),
    )).then((rows) => rows[0]),
    ctx.db.select({ id: channelAccount.id, brandId: channelAccount.brandId, tipo: channelAccount.tipo }).from(channelAccount).where(and(
      eq(channelAccount.id, data.channelAccountId),
      eq(channelAccount.orgId, ctx.orgId),
    )).then((rows) => rows[0]),
  ]);
  if (!produtoRow || !contaRow || produtoRow.brandId !== contaRow.brandId) {
    throw new Error("Produto e canal devem pertencer a mesma marca.");
  }
  if (contaRow.tipo === "tiktokshop" && (!data.externalSkuId || !data.externalWarehouseId)) {
    throw new Error("TikTok Shop exige SKU externo e warehouse externo.");
  }

  await ctx.db.insert(produtoCanal).values({
    orgId: ctx.orgId,
    produtoId: data.produtoId,
    channelAccountId: data.channelAccountId,
    externalListingId: data.externalListingId,
    externalSkuId: data.externalSkuId,
    externalWarehouseId: data.externalWarehouseId,
    ativo: true,
  }).onConflictDoUpdate({
    target: [produtoCanal.produtoId, produtoCanal.channelAccountId],
    set: {
      externalListingId: data.externalListingId,
      externalSkuId: data.externalSkuId,
      externalWarehouseId: data.externalWarehouseId,
      ativo: true,
      updatedAt: new Date(),
    },
  });

  await ctx.db.insert(auditLog).values({
    orgId: ctx.orgId,
    brandId: produtoRow.brandId,
    autorId: ctx.userId,
    autorTipo: ctx.userId ? "usuario" : "sistema",
    entidade: "produto_canal",
    entidadeId: data.produtoId,
    acao: "upsert",
    depois: {
      produtoId: data.produtoId,
      channelAccountId: data.channelAccountId,
      externalListingId: data.externalListingId,
    },
  });
}
