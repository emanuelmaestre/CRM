import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { assertPerfil, type CrudContext } from "@/shared/lib/crud-factory";
import {
  auditLog,
  brand,
  channelAccount,
  conversa,
  org,
  pedido,
  produto,
  produtoCanal,
} from "@/shared/lib/db/schema";
import { createClient } from "@supabase/supabase-js";
import { brandEnvSuffix, canaisDaMarca } from "@/shared/config/brands";
import { isCredencialConfigurada } from "@/shared/config/env-credentials";
import { CANAIS_TOKEN_SHOPEE, shopeeAppEnvSuffix } from "@/shared/config/shopee-env";
import { criarProduto } from "@/modules/estoque/application/estoque.service";

const CANAL_LABEL: Record<string, string> = {
  mercadolivre: "Mercado Livre",
  shopee: "Shopee",
  tiktokshop: "TikTok Shop",
};

// Shopee tem um par de partner_id/partner_key por ambiente (SHOPEE_ENV) — a
// função lê qual sufixo (TEST/LIVE) vale agora, então essa lista não pode ser
// estática como as dos outros canais.
//
// Sem SHOPEE_ACCESS_TOKEN_{BRAND} de propósito: o token vem do OAuth e mora
// em canal_tokens (criarShopeeProvider lê de lá), não do ambiente. Mesmo
// padrão do Mercado Livre, que também não cobra ML_ACCESS_TOKEN_{BRAND}
// aqui — SHOPEE_SHOP_ID_{BRAND} continua exigido pelo mesmo motivo que
// ML_SELLER_ID_{BRAND}: é o valor usado para detectar se o OAuth conectou a
// loja errada (externalAccountIdMismatch), não uma credencial de acesso.
function envPorCanal(canal: string): string[] {
  if (canal === "shopee") {
    const sufixo = shopeeAppEnvSuffix();
    return [`SHOPEE_PARTNER_ID_${sufixo}`, `SHOPEE_PARTNER_KEY_${sufixo}`, "SHOPEE_SHOP_ID_{BRAND}"];
  }
  return ENV_POR_CANAL[canal] ?? [];
}

const ENV_POR_CANAL: Record<string, string[]> = {
  mercadolivre: ["ML_CLIENT_ID", "ML_CLIENT_SECRET", "ML_SELLER_ID_{BRAND}"],
  tiktokshop: ["TIKTOK_SERVICE_ID", "TIKTOK_APP_KEY", "TIKTOK_APP_SECRET", "TIKTOK_SHOP_ID_{BRAND}", "TIKTOK_SHOP_CIPHER_{BRAND}", "TIKTOK_ACCESS_TOKEN_{BRAND}"],
};

const EXTERNAL_ID_ENV: Record<string, string | null> = {
  mercadolivre: "ML_SELLER_ID_{BRAND}",
  shopee: "SHOPEE_SHOP_ID_{BRAND}",
  tiktokshop: "TIKTOK_SHOP_ID_{BRAND}",
};

function envName(template: string, brandSlug: string) {
  return template.replace("{BRAND}", brandEnvSuffix(brandSlug));
}

const configured = isCredencialConfigurada;

export interface CanalConfiguracao {
  id: string;
  channelAccountId: string | null;
  canal: string;
  canalLabel: string;
  brand: string;
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
  externalAccountIdSource: "database" | "environment" | null;
  externalAccountIdMismatch: boolean;
  /** Só para canal "shopee": app "Elisa Lima Pedidos" (Order Management) já
   *  autorizado via OAuth pra esta marca — autorização independente da do
   *  app de catálogo (`status`/`pronto` acima refletem só o catálogo). */
  shopeePedidosConectado: boolean;
  /** Só para canal "shopee": app "Elisa Lima Anuncios" (Ads Service, Product
   *  Ads) já autorizado via OAuth pra esta marca. Terceira autorização
   *  independente da mesma loja — ver canal_tokens.canal = "shopee_anuncios". */
  shopeeAnunciosConectado: boolean;
  /** Só para canal "shopee": app "Elisa Lima Financeiro" (Accounting And
   *  Finance — repasses, taxas e escrow) autorizado para esta marca. Mais uma
   *  concessão independente da mesma loja — ver canal_tokens.canal =
   *  "shopee_financeiro". */
  shopeeFinanceiroConectado: boolean;
}

const ContaCanalInputSchema = z.object({
  brandId: z.string().uuid(),
  tipo: z.enum(["mercadolivre", "shopee", "tiktokshop"]),
  nome: z.string().trim().min(2).max(120),
  externalAccountId: z.string().trim().max(200).optional(),
}).superRefine((data, ctx) => {
  if (!data.externalAccountId) {
    ctx.addIssue({
      code: "custom",
      path: ["externalAccountId"],
      message: "O identificador externo é obrigatório para contas de canais de venda.",
    });
  }
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

const ImportarProdutoMercadoLivreSchema = z.object({
  brandId: z.string().uuid(),
  channelAccountId: z.string().uuid(),
  externalListingId: z.string().trim().min(1).max(200),
  externalSkuId: z.string().trim().min(1).max(80),
  variationId: z.string().trim().max(200).optional(),
  nome: z.string().trim().min(2).max(160),
  preco: z.string().trim().regex(/^\d+(?:\.\d{1,2})?$/).refine((value) => Number(value) > 0),
});

function extrairExternalAccountId(meta: unknown): string | null {
  if (meta && typeof meta === "object" && "externalAccountId" in meta) {
    const value = (meta as { externalAccountId?: unknown }).externalAccountId;
    return typeof value === "string" && value.length > 0 ? value : null;
  }
  return null;
}

function externalAccountIdDoAmbiente(canal: string, brandSlug: string): string | null {
  const template = EXTERNAL_ID_ENV[canal];
  if (!template) return null;
  const value = process.env[envName(template, brandSlug)]?.trim();
  return value && configured(envName(template, brandSlug)) ? value : null;
}

export async function obterResumoConfiguracoes(ctx: CrudContext) {
  const [organizacao, marcas] = await Promise.all([
    ctx.db.select({ name: org.name }).from(org).where(eq(org.id, ctx.orgId)).then((rows) => rows[0]),
    ctx.db.select({ name: brand.name }).from(brand).where(and(
      eq(brand.orgId, ctx.orgId),
      eq(brand.active, true),
    )),
  ]);

  const environment = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development";
  return {
    organizationName: organizacao?.name ?? "Organização não encontrada",
    activeBrands: marcas.map((item) => item.name),
    environment,
    externalSendsEnabled: process.env.EXTERNAL_SENDS_ENABLED === "true",
    inngestConfigured: configured("INNGEST_SIGNING_KEY") && configured("INNGEST_EVENT_KEY"),
    openAiConfigured: configured("OPENAI_API_KEY"),
  };
}

/** Marcas que já autorizaram cada app extra da Shopee (Pedidos e Anúncios),
 *  numa consulta só. São linhas independentes em canal_tokens — a ausência de
 *  uma não diz nada sobre as outras, e é justamente por isso que conectar um
 *  app não obriga a reconectar os demais. */
async function brandIdsPorCanalTokenShopee(ctx: CrudContext): Promise<Map<string, Set<string>>> {
  const porCanal = new Map<string, Set<string>>(
    CANAIS_TOKEN_SHOPEE.map((canal) => [canal as string, new Set<string>()]),
  );
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return porCanal;
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data } = await supabase
    .from("canal_tokens")
    .select("brand_id, canal")
    .eq("org_id", ctx.orgId)
    .in("canal", CANAIS_TOKEN_SHOPEE);
  for (const row of data ?? []) {
    porCanal.get(row.canal as string)?.add(row.brand_id as string);
  }
  return porCanal;
}

export async function listarConfiguracaoCanais(ctx: CrudContext): Promise<CanalConfiguracao[]> {
  const [marcas, contas, mapeamentos, brandIdsPorCanal] = await Promise.all([
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
    brandIdsPorCanalTokenShopee(ctx),
  ]);
  const brandIdsPedidos = brandIdsPorCanal.get("shopee_pedidos") ?? new Set<string>();
  const brandIdsAnuncios = brandIdsPorCanal.get("shopee_anuncios") ?? new Set<string>();
  const brandIdsFinanceiro = brandIdsPorCanal.get("shopee_financeiro") ?? new Set<string>();

  const skusPorConta = new Map<string, number>();
  for (const item of mapeamentos) {
    skusPorConta.set(item.channelAccountId, (skusPorConta.get(item.channelAccountId) ?? 0) + 1);
  }

  return marcas.flatMap((marca) => canaisDaMarca(marca.slug).map((canal) => {
    const conta = contas.find((item) => item.brandId === marca.id && item.tipo === canal);
    const envAusentes = envPorCanal(canal)
      .map((template) => envName(template, marca.slug))
      .filter((name) => !configured(name));
    const skusMapeados = conta ? skusPorConta.get(conta.id) ?? 0 : 0;
    const status = conta?.status ?? "pendente";
    const databaseExternalAccountId = conta ? extrairExternalAccountId(conta.meta) : null;
    const environmentExternalAccountId = externalAccountIdDoAmbiente(canal, marca.slug);
    const externalAccountId = databaseExternalAccountId ?? environmentExternalAccountId;

    return {
      id: `${marca.slug}-${canal}`,
      channelAccountId: conta?.id ?? null,
      canal,
      canalLabel: CANAL_LABEL[canal] ?? canal,
      brand: marca.slug,
      brandId: marca.id,
      brandLabel: marca.name,
      status,
      contaNome: conta?.nome ?? null,
      ultimaVerificacao: conta?.ultimaVerificacao?.toISOString() ?? null,
      ultimoErro: conta?.ultimoErro ?? null,
      externalAccountId,
      externalAccountIdSource: databaseExternalAccountId
        ? "database"
        : environmentExternalAccountId ? "environment" : null,
      externalAccountIdMismatch: Boolean(
        databaseExternalAccountId
        && environmentExternalAccountId
        && databaseExternalAccountId !== environmentExternalAccountId,
      ),
      skusMapeados,
      envAusentes,
      pronto: status === "conectado" && envAusentes.length === 0 && skusMapeados > 0,
      shopeePedidosConectado: canal === "shopee" && brandIdsPedidos.has(marca.id),
      shopeeAnunciosConectado: canal === "shopee" && brandIdsAnuncios.has(marca.id),
      shopeeFinanceiroConectado: canal === "shopee" && brandIdsFinanceiro.has(marca.id),
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
    depois: {
      id: conta.id,
      tipo: conta.tipo,
      nome: conta.nome,
      status: conta.status,
      externalAccountId: data.externalAccountId ?? null,
    },
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
      tipo: channelAccount.tipo,
      nome: channelAccount.nome,
      meta: channelAccount.meta,
    })
    .from(channelAccount)
    .where(and(eq(channelAccount.id, data.channelAccountId), eq(channelAccount.orgId, ctx.orgId)))
    .then((rows) => rows[0]);
  if (!contaAtual) throw new Error("Conta de canal nao encontrada.");

  if (!data.externalAccountId) {
    throw new Error("O identificador externo é obrigatório para contas de canais de venda.");
  }

  const metaAtual = contaAtual.meta && typeof contaAtual.meta === "object"
    ? { ...(contaAtual.meta as Record<string, unknown>) }
    : {};
  if (data.externalAccountId) metaAtual.externalAccountId = data.externalAccountId;
  else delete metaAtual.externalAccountId;
  const novoMeta = Object.keys(metaAtual).length > 0 ? metaAtual : null;

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
    throw new Error("TikTok Shop exige o SKU do vendedor e o ID interno do SKU (sku_id).");
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

export async function importarProdutoMercadoLivreConfiguracao(ctx: CrudContext, input: unknown) {
  assertPerfil(ctx, ["admin", "gestor"]);
  const data = ImportarProdutoMercadoLivreSchema.parse(input);
  const conta = await ctx.db
    .select({ id: channelAccount.id, brandId: channelAccount.brandId, status: channelAccount.status })
    .from(channelAccount)
    .where(and(
      eq(channelAccount.id, data.channelAccountId),
      eq(channelAccount.orgId, ctx.orgId),
      eq(channelAccount.tipo, "mercadolivre"),
    ))
    .then((rows) => rows[0]);
  if (!conta || conta.brandId !== data.brandId || conta.status !== "conectado") {
    throw new Error("Conta Mercado Livre conectada não pertence à marca informada.");
  }

  const sku = data.externalSkuId.toUpperCase();
  let produtoRow = await ctx.db
    .select({ id: produto.id, brandId: produto.brandId })
    .from(produto)
    .where(and(eq(produto.orgId, ctx.orgId), eq(produto.sku, sku), isNull(produto.deletedAt)))
    .then((rows) => rows[0]);
  if (produtoRow && produtoRow.brandId !== data.brandId) {
    throw new Error("Este SKU já pertence a outra empresa no catálogo interno.");
  }

  let criado = false;
  if (!produtoRow) {
    const novo = await criarProduto(ctx, {
      brandId: data.brandId,
      sku,
      nome: data.nome,
      preco: data.preco,
      estoqueMinimo: 0,
      ativo: true,
    });
    produtoRow = { id: novo.id, brandId: novo.brandId };
    criado = true;
  }

  await salvarMapeamentoCanalConfiguracao(ctx, {
    produtoId: produtoRow.id,
    channelAccountId: data.channelAccountId,
    externalListingId: data.externalListingId,
    externalSkuId: data.externalSkuId,
    externalWarehouseId: data.variationId,
  });
  return { produtoId: produtoRow.id, criado };
}
