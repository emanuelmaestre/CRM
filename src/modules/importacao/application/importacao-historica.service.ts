import { and, count, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/shared/lib/db";
import {
  auditLog,
  brand,
  channelAccount,
  cliente,
  clienteIdentidade,
  importItem,
  importLote,
  pedido,
  pedidoItem,
  produto,
  produtoCanal,
} from "@/shared/lib/db/schema";
import { assertPerfil, type CrudContext } from "@/shared/lib/crud-factory";
import { emitirEvento } from "@/shared/events";
import { criarMLProvider } from "@/modules/canais/infrastructure/mercadolivre.provider";
import { mapearStatusPedido } from "@/modules/canais/domain/order-status";
import { isBrandSlug, type BrandSlug } from "@/shared/config/brands";
import type { PedidoNormalizado } from "@/modules/canais/domain/ports";

const ProtecoesHistoricas = {
  executarAutomacoes: false,
  movimentarEstoque: false,
  sincronizarMarketplace: false,
  preservarDataOriginal: true,
} as const;

const CriarLoteHistoricoSchema = z.object({
  brand: z.string().refine(isBrandSlug, "Empresa nao suportada."),
  de: z.iso.datetime(),
  ate: z.iso.datetime(),
}).superRefine((value, ctx) => {
  const de = new Date(value.de);
  const ate = new Date(value.ate);
  if (de >= ate) ctx.addIssue({ code: "custom", path: ["ate"], message: "A data final deve ser posterior a inicial." });
  if (ate.getTime() > Date.now() + 60_000) ctx.addIssue({ code: "custom", path: ["ate"], message: "A data final nao pode estar no futuro." });
  if (ate.getTime() - de.getTime() > 10 * 365 * 86_400_000) {
    ctx.addIssue({ code: "custom", path: ["de"], message: "O intervalo maximo e de 10 anos." });
  }
});

const ItemPedidoHistoricoSchema = z.object({
  skuExterno: z.string(),
  quantidade: z.number().int().positive(),
  precoUnitario: z.string().regex(/^\d+(?:\.\d{1,2})?$/),
});

export const PedidoHistoricoPayloadSchema = z.object({
  providerOrderId: z.string().min(1),
  canal: z.literal("mercadolivre"),
  clienteExternalId: z.string().min(1),
  clienteNome: z.string().min(1),
  clienteEmail: z.string().optional(),
  clienteTelefone: z.string().optional(),
  status: z.string().min(1),
  total: z.string().regex(/^\d+(?:\.\d{1,2})?$/),
  frete: z.string().regex(/^\d+(?:\.\d{1,2})?$/).optional(),
  itens: z.array(ItemPedidoHistoricoSchema).min(1),
  criadoEm: z.iso.datetime(),
});

export type PedidoHistoricoPayload = z.infer<typeof PedidoHistoricoPayloadSchema>;
export type PendenciaHistorica = {
  codigo: "payload_invalido" | "sku_ausente" | "sku_nao_mapeado";
  mensagem: string;
  sku?: string;
};

type ConfiguracaoLoteHistorico = {
  brand: BrandSlug;
  de: string;
  ate: string;
  protecoes: typeof ProtecoesHistoricas;
};

export function serializarPedidoHistorico(pedidoNormalizado: PedidoNormalizado): PedidoHistoricoPayload {
  return PedidoHistoricoPayloadSchema.parse({
    ...pedidoNormalizado,
    criadoEm: pedidoNormalizado.criadoEm.toISOString(),
  });
}

export function validarPedidoHistorico(
  payload: unknown,
  skusMapeados: ReadonlySet<string>,
): { payload?: PedidoHistoricoPayload; pendencias: PendenciaHistorica[] } {
  const parsed = PedidoHistoricoPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      pendencias: [{
        codigo: "payload_invalido",
        mensagem: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
      }],
    };
  }

  const pendencias: PendenciaHistorica[] = [];
  for (const item of parsed.data.itens) {
    const sku = item.skuExterno.trim();
    if (!sku) {
      pendencias.push({ codigo: "sku_ausente", mensagem: "Item sem SELLER_SKU no Mercado Livre." });
    } else if (!skusMapeados.has(sku)) {
      pendencias.push({ codigo: "sku_nao_mapeado", sku, mensagem: `SKU ${sku} ainda nao esta vinculado a um produto interno.` });
    }
  }
  return { payload: parsed.data, pendencias };
}

function lerConfiguracao(value: unknown): ConfiguracaoLoteHistorico {
  const config = value as Partial<ConfiguracaoLoteHistorico> | null;
  if (!config || !config.brand || !isBrandSlug(config.brand) || !config.de || !config.ate) {
    throw new Error("Configuracao do lote historico esta incompleta.");
  }
  return { brand: config.brand, de: config.de, ate: config.ate, protecoes: ProtecoesHistoricas };
}

export async function criarLoteHistorico(ctx: CrudContext, input: unknown) {
  assertPerfil(ctx, ["admin"]);
  const parsed = CriarLoteHistoricoSchema.parse(input);
  const brandSlug = parsed.brand as BrandSlug;

  const conta = await db
    .select({ id: channelAccount.id, brandId: brand.id, status: channelAccount.status, brandName: brand.name })
    .from(channelAccount)
    .innerJoin(brand, and(eq(brand.id, channelAccount.brandId), eq(brand.orgId, channelAccount.orgId)))
    .where(and(
      eq(channelAccount.orgId, ctx.orgId),
      eq(channelAccount.tipo, "mercadolivre"),
      eq(brand.slug, brandSlug),
      eq(brand.active, true),
    ))
    .then((rows) => rows[0]);
  if (!conta) throw new Error("Conta Mercado Livre nao cadastrada para esta empresa.");
  if (conta.status !== "conectado") throw new Error("Conecte a conta do Mercado Livre antes de preparar o historico.");

  const ativo = await db
    .select({ id: importLote.id })
    .from(importLote)
    .where(and(
      eq(importLote.orgId, ctx.orgId),
      eq(importLote.channelAccountId, conta.id),
      eq(importLote.tipo, "pedidos_historicos_mercadolivre"),
      inArray(importLote.status, ["preparando", "pronto", "importando"]),
    ))
    .then((rows) => rows[0]);
  if (ativo) throw new Error("Ja existe um lote historico ativo para esta empresa. Conclua ou descarte o lote atual.");

  const configuracao: ConfiguracaoLoteHistorico = {
    brand: brandSlug,
    de: parsed.de,
    ate: parsed.ate,
    protecoes: ProtecoesHistoricas,
  };
  const [lote] = await db.insert(importLote).values({
    orgId: ctx.orgId,
    brandId: conta.brandId,
    channelAccountId: conta.id,
    tipo: "pedidos_historicos_mercadolivre",
    nomeArquivo: `mercadolivre-${brandSlug}-${parsed.de.slice(0, 10)}-${parsed.ate.slice(0, 10)}.json`,
    status: "preparando",
    fase: "coleta",
    progresso: 0,
    configuracao,
    solicitadoPorId: ctx.userId,
  }).returning({ id: importLote.id });

  await db.insert(auditLog).values({
    orgId: ctx.orgId,
    brandId: conta.brandId,
    autorId: ctx.userId,
    autorTipo: "usuario",
    entidade: "import_lote",
    entidadeId: lote.id,
    acao: "historical_import.preparation_requested",
    depois: { configuracao, protecoes: ProtecoesHistoricas },
  });

  return { loteId: lote.id, brand: brandSlug, brandName: conta.brandName };
}

export async function prepararPaginaLoteHistorico(loteId: string, offset: number) {
  const lote = await db
    .select()
    .from(importLote)
    .where(and(eq(importLote.id, loteId), eq(importLote.tipo, "pedidos_historicos_mercadolivre")))
    .then((rows) => rows[0]);
  if (!lote || !lote.channelAccountId) throw new Error("Lote historico nao encontrado.");
  const config = lerConfiguracao(lote.configuracao);
  const provider = await criarMLProvider(config.brand);
  const pagina = await provider.listarPedidosHistoricos({
    de: new Date(config.de),
    ate: new Date(config.ate),
    offset,
    limit: 50,
  });

  const [mapeamentos, existentes] = await Promise.all([
    db
      .select({ sku: produtoCanal.externalSkuId })
      .from(produtoCanal)
      .where(and(
        eq(produtoCanal.orgId, lote.orgId),
        eq(produtoCanal.channelAccountId, lote.channelAccountId),
        eq(produtoCanal.ativo, true),
      )),
    pagina.pedidos.length === 0
      ? Promise.resolve([])
      : db
        .select({ providerOrderId: pedido.providerOrderId })
        .from(pedido)
        .where(and(
          eq(pedido.orgId, lote.orgId),
          eq(pedido.channelAccountId, lote.channelAccountId),
          inArray(pedido.providerOrderId, pagina.pedidos.map((item) => item.providerOrderId)),
        )),
  ]);
  const skus = new Set(mapeamentos.flatMap((item) => item.sku ? [item.sku] : []));
  const pedidosExistentes = new Set(existentes.flatMap((item) => item.providerOrderId ? [item.providerOrderId] : []));

  for (const item of pagina.pedidos) {
    const payload = serializarPedidoHistorico(item);
    const validacao = validarPedidoHistorico(payload, skus);
    const duplicado = pedidosExistentes.has(payload.providerOrderId);
    await db.insert(importItem).values({
      orgId: lote.orgId,
      loteId,
      providerRecordId: payload.providerOrderId,
      status: duplicado ? "duplicado" : validacao.pendencias.length > 0 ? "quarentena" : "validado",
      payload,
      erros: validacao.pendencias,
    }).onConflictDoNothing();
  }

  const processados = Math.min(pagina.total, pagina.offset + pagina.pedidos.length);
  await db.update(importLote).set({
    totalLinhas: pagina.total,
    progresso: pagina.total === 0 ? 100 : Math.min(99, Math.round((processados / pagina.total) * 100)),
  }).where(eq(importLote.id, loteId));
  return { total: pagina.total, processados, proximoOffset: processados, encontrou: pagina.pedidos.length };
}

export async function finalizarPreparacaoLoteHistorico(loteId: string) {
  const lote = await db.select().from(importLote).where(eq(importLote.id, loteId)).then((rows) => rows[0]);
  if (!lote) throw new Error("Lote historico nao encontrado.");
  const grupos = await db
    .select({ status: importItem.status, total: count() })
    .from(importItem)
    .where(and(eq(importItem.orgId, lote.orgId), eq(importItem.loteId, loteId)))
    .groupBy(importItem.status);
  const resumo = Object.fromEntries(grupos.map((item) => [item.status, Number(item.total)]));
  const aceitos = resumo.validado ?? 0;
  const rejeitados = resumo.quarentena ?? 0;
  const duplicados = resumo.duplicado ?? 0;
  const total = grupos.reduce((sum, item) => sum + Number(item.total), 0);
  const status = aceitos > 0 ? "pronto" : rejeitados > 0 ? "com_erros" : "vazio";

  await db.update(importLote).set({
    status,
    fase: "revisao",
    progresso: 100,
    totalLinhas: total,
    aceitos,
    rejeitados,
    erros: { quarentena: rejeitados, duplicados },
    finalizadoEm: new Date(),
  }).where(eq(importLote.id, loteId));
  return { total, aceitos, rejeitados, duplicados, status };
}

export async function listarLotesHistoricos(ctx: CrudContext) {
  assertPerfil(ctx, ["admin"]);
  const lotes = await db
    .select({
      id: importLote.id,
      brandName: brand.name,
      brandSlug: brand.slug,
      status: importLote.status,
      fase: importLote.fase,
      progresso: importLote.progresso,
      total: importLote.totalLinhas,
      aceitos: importLote.aceitos,
      rejeitados: importLote.rejeitados,
      erros: importLote.erros,
      configuracao: importLote.configuracao,
      createdAt: importLote.createdAt,
      finalizadoEm: importLote.finalizadoEm,
    })
    .from(importLote)
    .innerJoin(brand, and(eq(brand.id, importLote.brandId), eq(brand.orgId, importLote.orgId)))
    .where(and(eq(importLote.orgId, ctx.orgId), eq(importLote.tipo, "pedidos_historicos_mercadolivre")))
    .orderBy(desc(importLote.createdAt))
    .limit(12);
  return lotes.map((lote) => ({
    ...lote,
    createdAt: lote.createdAt.toISOString(),
    finalizadoEm: lote.finalizadoEm?.toISOString() ?? null,
  }));
}

export async function obterLoteHistorico(ctx: CrudContext, loteId: string) {
  assertPerfil(ctx, ["admin"]);
  const lote = await listarLotesHistoricos(ctx).then((items) => items.find((item) => item.id === loteId));
  if (!lote) throw new Error("Lote historico nao encontrado.");
  const pendencias = await db
    .select({ providerRecordId: importItem.providerRecordId, erros: importItem.erros })
    .from(importItem)
    .where(and(
      eq(importItem.orgId, ctx.orgId),
      eq(importItem.loteId, loteId),
      eq(importItem.status, "quarentena"),
    ))
    .limit(8);
  const duplicados = await db
    .select({ total: count() })
    .from(importItem)
    .where(and(eq(importItem.orgId, ctx.orgId), eq(importItem.loteId, loteId), eq(importItem.status, "duplicado")))
    .then((rows) => Number(rows[0]?.total ?? 0));
  return { ...lote, duplicados, pendencias };
}

export async function confirmarLoteHistorico(ctx: CrudContext, loteId: string) {
  assertPerfil(ctx, ["admin"]);
  const [lote] = await db
    .update(importLote)
    .set({ status: "importando", fase: "importacao", progresso: 0, finalizadoEm: null })
    .where(and(
      eq(importLote.id, loteId),
      eq(importLote.orgId, ctx.orgId),
      eq(importLote.tipo, "pedidos_historicos_mercadolivre"),
      eq(importLote.status, "pronto"),
    ))
    .returning({ id: importLote.id, brandId: importLote.brandId, aceitos: importLote.aceitos });
  if (!lote) throw new Error("O lote precisa estar pronto para ser importado.");

  await db.insert(auditLog).values({
    orgId: ctx.orgId,
    brandId: lote.brandId,
    autorId: ctx.userId,
    autorTipo: "usuario",
    entidade: "import_lote",
    entidadeId: lote.id,
    acao: "historical_import.confirmed",
    depois: { pedidosAutorizados: lote.aceitos, protecoes: ProtecoesHistoricas },
  });
  return { loteId: lote.id, total: lote.aceitos };
}

export async function importarProximoBlocoHistorico(loteId: string, limit = 50) {
  const lote = await db.select().from(importLote).where(eq(importLote.id, loteId)).then((rows) => rows[0]);
  if (!lote || !lote.brandId || !lote.channelAccountId) throw new Error("Lote historico nao encontrado.");
  const items = await db
    .select({ id: importItem.id, payload: importItem.payload })
    .from(importItem)
    .where(and(eq(importItem.orgId, lote.orgId), eq(importItem.loteId, loteId), eq(importItem.status, "validado")))
    .limit(limit);

  let importados = 0;
  let duplicados = 0;
  let erros = 0;
  for (const item of items) {
    try {
      const resultado = await importarItemHistorico(lote, item.id, item.payload);
      if (resultado === "importado") importados++;
      if (resultado === "duplicado") duplicados++;
    } catch (error) {
      erros++;
      await db.update(importItem).set({
        status: "erro",
        erros: [{ codigo: "falha_importacao", mensagem: error instanceof Error ? error.message : String(error) }],
      }).where(and(eq(importItem.id, item.id), eq(importItem.orgId, lote.orgId)));
    }
  }

  const pendentes = await db
    .select({ total: count() })
    .from(importItem)
    .where(and(
      eq(importItem.orgId, lote.orgId),
      eq(importItem.loteId, loteId),
      eq(importItem.status, "validado"),
    ))
    .then((rows) => Number(rows[0]?.total ?? 0));
  const alvo = Math.max(1, lote.aceitos);
  const processados = Math.max(0, lote.aceitos - pendentes);
  await db.update(importLote).set({ progresso: Math.min(99, Math.round((processados / alvo) * 100)) }).where(eq(importLote.id, loteId));
  return { encontrados: items.length, importados, duplicados, erros, processados };
}

async function importarItemHistorico(
  lote: typeof importLote.$inferSelect,
  itemId: string,
  rawPayload: unknown,
): Promise<"importado" | "duplicado"> {
  const payload = PedidoHistoricoPayloadSchema.parse(rawPayload);
  const brandId = lote.brandId;
  const channelAccountId = lote.channelAccountId;
  if (!brandId || !channelAccountId) throw new Error("Lote historico sem empresa ou conta de canal.");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${lote.orgId}:${channelAccountId}:${payload.providerOrderId}`}, 0))`);
    const itemAtual = await tx
      .select({ status: importItem.status })
      .from(importItem)
      .where(and(eq(importItem.id, itemId), eq(importItem.orgId, lote.orgId)))
      .for("update")
      .then((rows) => rows[0]);
    if (!itemAtual || itemAtual.status !== "validado") return "duplicado";

    const existente = await tx
      .select({ id: pedido.id })
      .from(pedido)
      .where(and(
        eq(pedido.orgId, lote.orgId),
        eq(pedido.channelAccountId, channelAccountId),
        eq(pedido.providerOrderId, payload.providerOrderId),
      ))
      .then((rows) => rows[0]);
    if (existente) {
      await tx.update(importItem).set({ status: "duplicado", pedidoId: existente.id }).where(eq(importItem.id, itemId));
      return "duplicado";
    }

    const mapeamentos = await tx
      .select({ produtoId: produtoCanal.produtoId, sku: produtoCanal.externalSkuId })
      .from(produtoCanal)
      .innerJoin(produto, and(eq(produto.id, produtoCanal.produtoId), eq(produto.orgId, produtoCanal.orgId)))
      .where(and(
        eq(produtoCanal.orgId, lote.orgId),
        eq(produtoCanal.channelAccountId, channelAccountId),
        eq(produtoCanal.ativo, true),
        eq(produto.brandId, brandId),
      ));
    const produtoPorSku = new Map(mapeamentos.flatMap((row) => row.sku ? [[row.sku, row.produtoId] as const] : []));
    const ausentes = payload.itens.map((item) => item.skuExterno).filter((sku) => !produtoPorSku.has(sku));
    if (ausentes.length > 0) throw new Error(`Mapeamento alterado durante a importacao: ${[...new Set(ausentes)].join(", ")}.`);

    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${lote.orgId}:mercadolivre:${payload.clienteExternalId}`}, 0))`);
    let clienteId = await tx
      .select({ clienteId: clienteIdentidade.clienteId })
      .from(clienteIdentidade)
      .where(and(
        eq(clienteIdentidade.orgId, lote.orgId),
        eq(clienteIdentidade.canal, "mercadolivre"),
        eq(clienteIdentidade.externalId, payload.clienteExternalId),
      ))
      .then((rows) => rows[0]?.clienteId);
    if (!clienteId) {
      const contatos = [
        payload.clienteEmail ? eq(cliente.email, payload.clienteEmail) : undefined,
        payload.clienteTelefone ? eq(cliente.telefone, payload.clienteTelefone) : undefined,
      ].filter((condicao): condicao is NonNullable<typeof condicao> => Boolean(condicao));
      const clientePorContatoId = contatos.length > 0
        ? await tx
            .select({ id: cliente.id })
            .from(cliente)
            .where(and(eq(cliente.orgId, lote.orgId), isNull(cliente.deletedAt), or(...contatos)))
            .then((rows) => rows[0]?.id)
        : undefined;
      if (clientePorContatoId) clienteId = clientePorContatoId;
      if (!clienteId) {
        const [novoCliente] = await tx.insert(cliente).values({
          orgId: lote.orgId,
          nome: payload.clienteNome,
          email: payload.clienteEmail,
          telefone: payload.clienteTelefone,
          createdAt: new Date(payload.criadoEm),
        }).returning({ id: cliente.id });
        clienteId = novoCliente.id;
      }
      if (!clienteId) throw new Error("Nao foi possivel identificar o cliente do pedido historico.");
      await tx.insert(clienteIdentidade).values({
        clienteId,
        orgId: lote.orgId,
        canal: "mercadolivre",
        externalId: payload.clienteExternalId,
        meta: { origem: "importacao_historica", importLoteId: lote.id },
      });
    }

    const dataOriginal = new Date(payload.criadoEm);
    const [novoPedido] = await tx.insert(pedido).values({
      orgId: lote.orgId,
      brandId,
      channelAccountId,
      clienteId,
      providerOrderId: payload.providerOrderId,
      canal: "mercadolivre",
      status: mapearStatusPedido(payload.status),
      total: payload.total,
      frete: payload.frete ?? "0",
      origemIngestao: "historico",
      importLoteId: lote.id,
      importedAt: new Date(),
      receivedAt: dataOriginal,
      createdAt: dataOriginal,
    }).returning({ id: pedido.id });
    await tx.insert(pedidoItem).values(payload.itens.map((item) => ({
      pedidoId: novoPedido.id,
      produtoId: produtoPorSku.get(item.skuExterno)!,
      quantidade: item.quantidade,
      precoUnitario: item.precoUnitario,
    })));
    await tx.update(importItem).set({ status: "importado", pedidoId: novoPedido.id }).where(eq(importItem.id, itemId));
    return "importado";
  });
}

export async function finalizarImportacaoLoteHistorico(loteId: string) {
  const lote = await db.select().from(importLote).where(eq(importLote.id, loteId)).then((rows) => rows[0]);
  if (!lote) throw new Error("Lote historico nao encontrado.");
  const grupos = await db
    .select({ status: importItem.status, total: count() })
    .from(importItem)
    .where(and(eq(importItem.orgId, lote.orgId), eq(importItem.loteId, loteId)))
    .groupBy(importItem.status);
  const resumo = Object.fromEntries(grupos.map((item) => [item.status, Number(item.total)]));
  const importados = resumo.importado ?? 0;
  const falhas = resumo.erro ?? 0;
  const duplicados = resumo.duplicado ?? 0;
  const status = falhas > 0 ? "concluido_com_erros" : "concluido";
  await db.update(importLote).set({
    status,
    fase: "concluido",
    progresso: 100,
    aceitos: importados,
    rejeitados: (resumo.quarentena ?? 0) + falhas,
    erros: { falhas, duplicados, quarentena: resumo.quarentena ?? 0 },
    finalizadoEm: new Date(),
  }).where(eq(importLote.id, loteId));

  await db.insert(auditLog).values({
    orgId: lote.orgId,
    brandId: lote.brandId,
    autorTipo: "job",
    entidade: "import_lote",
    entidadeId: loteId,
    acao: "historical_import.completed",
    depois: { importados, falhas, duplicados, protecoes: ProtecoesHistoricas },
  });
  await emitirEvento({
    tipo: falhas > 0 ? "importacao.com_erros" : "importacao.concluida",
    orgId: lote.orgId,
    brandId: lote.brandId ?? undefined,
    entidade: "import_lote",
    entidadeId: loteId,
    payload: { modo: "historico", importados, falhas, duplicados, protecoes: ProtecoesHistoricas },
  });
  return { importados, falhas, duplicados, status };
}

export async function descartarLoteHistorico(ctx: CrudContext, loteId: string) {
  assertPerfil(ctx, ["admin"]);
  const lote = await db
    .select({ id: importLote.id, brandId: importLote.brandId, status: importLote.status })
    .from(importLote)
    .where(and(eq(importLote.id, loteId), eq(importLote.orgId, ctx.orgId), eq(importLote.tipo, "pedidos_historicos_mercadolivre")))
    .then((rows) => rows[0]);
  if (!lote) throw new Error("Lote historico nao encontrado.");
  if (["importando", "concluido", "concluido_com_erros"].includes(lote.status)) {
    throw new Error("Um lote ja promovido ao CRM nao pode ser descartado por esta tela.");
  }
  await db.delete(importLote).where(and(eq(importLote.id, loteId), eq(importLote.orgId, ctx.orgId)));
  await db.insert(auditLog).values({
    orgId: ctx.orgId,
    brandId: lote.brandId,
    autorId: ctx.userId,
    autorTipo: "usuario",
    entidade: "import_lote",
    entidadeId: loteId,
    acao: "historical_import.discarded",
    antes: { status: lote.status },
  });
  return { loteId };
}

export async function marcarFalhaLoteHistorico(loteId: string, error: unknown) {
  await db.update(importLote).set({
    status: "erro",
    fase: "erro",
    erros: [{ mensagem: error instanceof Error ? error.message : String(error) }],
    finalizadoEm: new Date(),
  }).where(eq(importLote.id, loteId));
}
