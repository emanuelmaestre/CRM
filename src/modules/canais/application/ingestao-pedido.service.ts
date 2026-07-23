"use server";

import { eq, and, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/shared/lib/db";
import { cliente, clienteIdentidade } from "@/shared/lib/db/schema/clientes";
import { channelAccount } from "@/shared/lib/db/schema/canais";
import { produto, produtoCanal } from "@/shared/lib/db/schema/estoque";
import { pedido, pedidoItem } from "@/shared/lib/db/schema/vendas";
import {
  despacharEvento,
  despacharEventosPendentes,
  persistirEvento,
  type DomainEventType,
  type PersistedDomainEvent,
} from "@/shared/events";
import type { PedidoNormalizado } from "../domain/ports";
import { deveAplicarStatusMarketplace, mapearStatusPedido } from "../domain/order-status";

type CanalSuportado = "shopee" | "mercadolivre" | "tiktokshop" | "olist";

function toCanal(canal: string): CanalSuportado {
  if (canal === "shopee" || canal === "mercadolivre" || canal === "tiktokshop" || canal === "olist") return canal;
  throw new Error(`Canal de pedido não suportado: ${canal}.`);
}

const PedidoIngestaoSchema = z.object({
  orgId: z.uuid(),
  brandId: z.uuid(),
  channelAccountId: z.uuid(),
  providerOrderId: z.string().min(1),
  clienteExternalId: z.string().min(1),
  clienteNome: z.string().min(1),
  itens: z.array(z.object({
    skuExterno: z.string().min(1),
    quantidade: z.number().int().positive(),
    precoUnitario: z.string().regex(/^\d+(?:\.\d{1,2})?$/),
  })).min(1),
});

export async function ingerirPedido(
  orgId: string,
  brandId: string,
  channelAccountId: string,
  p: PedidoNormalizado
): Promise<{ pedidoId: string; novo: boolean }> {
  PedidoIngestaoSchema.parse({ orgId, brandId, channelAccountId, ...p });
  const canal = toCanal(p.canal);

  const existente = await db
    .select({ id: pedido.id })
    .from(pedido)
    .where(and(
      eq(pedido.providerOrderId, p.providerOrderId),
      eq(pedido.channelAccountId, channelAccountId),
      eq(pedido.orgId, orgId),
    ))
    .then((r) => r[0]);

  if (existente) {
    await reconciliarStatusPedido(orgId, brandId, existente.id, p.status);
    return { pedidoId: existente.id, novo: false };
  }

  let persistido: { pedidoId: string; eventos: PersistedDomainEvent[]; novo: boolean };

  try {
    persistido = await db.transaction(async (tx) => {
    const conta = await tx
      .select({ id: channelAccount.id })
      .from(channelAccount)
      .where(and(
        eq(channelAccount.id, channelAccountId),
        eq(channelAccount.orgId, orgId),
        eq(channelAccount.brandId, brandId),
        eq(channelAccount.tipo, canal),
      ))
      .then((rows) => rows[0]);
    if (!conta) throw new Error("Conta de canal não pertence à organização, marca e canal informados.");

    // Serializa somente tentativas do mesmo pedido. Isso evita que duas entregas
    // simultâneas criem cliente/identidade antes de a constraint do pedido atuar.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${orgId}:${channelAccountId}:${p.providerOrderId}`}, 0))`);
    const pedidoConcorrente = await tx
      .select({ id: pedido.id })
      .from(pedido)
      .where(and(
        eq(pedido.orgId, orgId),
        eq(pedido.channelAccountId, channelAccountId),
        eq(pedido.providerOrderId, p.providerOrderId),
      ))
      .then((rows) => rows[0]);
    if (pedidoConcorrente) return { pedidoId: pedidoConcorrente.id, eventos: [], novo: false };

    const skus = [...new Set(p.itens.map((item) => item.skuExterno))];
    const produtos = await tx
      .select({
        id: produto.id,
        sku: produto.sku,
        externalSkuId: produtoCanal.externalSkuId,
      })
      .from(produtoCanal)
      .innerJoin(produto, and(
        eq(produto.id, produtoCanal.produtoId),
        eq(produto.orgId, produtoCanal.orgId),
      ))
      .where(and(
        eq(produtoCanal.orgId, orgId),
        eq(produtoCanal.channelAccountId, channelAccountId),
        eq(produtoCanal.ativo, true),
        eq(produto.orgId, orgId),
        eq(produto.brandId, brandId),
        isNull(produto.deletedAt),
      ));
    const produtoPorSku = new Map<string, string>();
    for (const item of produtos) {
      produtoPorSku.set(item.sku, item.id);
      if (item.externalSkuId) produtoPorSku.set(item.externalSkuId, item.id);
    }
    const skusAusentes = skus.filter((sku) => !produtoPorSku.has(sku));
    if (skusAusentes.length > 0) {
      throw new Error(`Pedido nÃ£o importado: SKUs sem produto na marca: ${skusAusentes.join(", ")}.`);
    }

    let clienteId: string;
    const identidade = await tx
      .select({ clienteId: clienteIdentidade.clienteId })
      .from(clienteIdentidade)
      .where(and(
        eq(clienteIdentidade.orgId, orgId),
        eq(clienteIdentidade.canal, canal),
        eq(clienteIdentidade.externalId, p.clienteExternalId),
      ))
      .then((rows) => rows[0]);

    if (identidade) {
      clienteId = identidade.clienteId;
    } else {
      const [novoCliente] = await tx
        .insert(cliente)
        .values({ orgId, nome: p.clienteNome, email: p.clienteEmail, telefone: p.clienteTelefone })
        .returning({ id: cliente.id });
      clienteId = novoCliente.id;

      await tx.insert(clienteIdentidade).values({
        clienteId,
        orgId,
        canal,
        externalId: p.clienteExternalId,
      });
    }

    const status = mapearStatusPedido(p.status);
    const [novoPedido] = await tx
      .insert(pedido)
      .values({
        orgId,
        brandId,
        channelAccountId,
        clienteId,
        providerOrderId: p.providerOrderId,
        canal,
        status,
        total: p.total,
        frete: p.frete ?? "0",
        createdAt: p.criadoEm,
      })
      .returning({ id: pedido.id });

    await tx.insert(pedidoItem).values(p.itens.map((item) => ({
      pedidoId: novoPedido.id,
      produtoId: produtoPorSku.get(item.skuExterno)!,
      quantidade: item.quantidade,
      precoUnitario: item.precoUnitario,
    })));

    const eventos: PersistedDomainEvent[] = [];
    eventos.push(await persistirEvento({
      tipo: "pedido.recebido",
      orgId,
      brandId,
      entidade: "pedido",
      entidadeId: novoPedido.id,
      payload: { canal, channelAccountId, providerOrderId: p.providerOrderId, total: p.total },
    }, tx));

    if (["pago", "separado", "enviado", "entregue", "concluido"].includes(status)) {
      eventos.push(await persistirEvento({
        tipo: "pedido.pago",
        orgId,
        brandId,
        entidade: "pedido",
        entidadeId: novoPedido.id,
        payload: { status: "pago", statusAnterior: "criado", origemStatus: status },
      }, tx));
    }

    if (["entregue", "concluido"].includes(status)) {
      eventos.push(await persistirEvento({
        tipo: "pedido.entregue",
        orgId,
        brandId,
        entidade: "pedido",
        entidadeId: novoPedido.id,
        payload: { status: "entregue", origemStatus: status },
      }, tx));
    }

    return { pedidoId: novoPedido.id, eventos, novo: true };
    });
  } catch (error) {
    if (!isPedidoDuplicado(error)) throw error;

    const concorrente = await db
      .select({ id: pedido.id })
      .from(pedido)
      .where(and(
        eq(pedido.orgId, orgId),
        eq(pedido.channelAccountId, channelAccountId),
        eq(pedido.providerOrderId, p.providerOrderId),
      ))
      .then((rows) => rows[0]);
    if (!concorrente) throw error;
    await reconciliarStatusPedido(orgId, brandId, concorrente.id, p.status);
    return { pedidoId: concorrente.id, novo: false };
  }

  const { pedidoId, eventos, novo } = persistido;

  if (!novo) {
    await reconciliarStatusPedido(orgId, brandId, pedidoId, p.status);
    return { pedidoId, novo: false };
  }

  for (const evento of eventos) await despacharEvento(evento);

  return { pedidoId, novo: true };
}

function isPedidoDuplicado(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { code?: string; constraint_name?: string; constraint?: string };
  const constraint = candidate.constraint_name ?? candidate.constraint;
  return candidate.code === "23505" && constraint === "uq_pedido_org_account_provider";
}

async function reconciliarStatusPedido(
  orgId: string,
  brandId: string,
  pedidoId: string,
  statusExterno: string,
): Promise<void> {
  const novoStatus = mapearStatusPedido(statusExterno);
  const resultado = await db.transaction(async (tx) => {
    const atual = await tx
      .select({ status: pedido.status, brandId: pedido.brandId })
      .from(pedido)
      .where(and(eq(pedido.id, pedidoId), eq(pedido.orgId, orgId)))
      .for("update")
      .then((rows) => rows[0]);
    if (
      !atual
      || atual.brandId !== brandId
      || !deveAplicarStatusMarketplace(atual.status, novoStatus)
    ) {
      return [] as PersistedDomainEvent[];
    }

    await tx
      .update(pedido)
      .set({ status: novoStatus, updatedAt: new Date() })
      .where(and(eq(pedido.id, pedidoId), eq(pedido.orgId, orgId)));

    const eventos: PersistedDomainEvent[] = [];
    const statusPagos = ["pago", "separado", "enviado", "entregue", "concluido"];
    if (statusPagos.includes(novoStatus) && !statusPagos.includes(atual.status)) {
      eventos.push(await persistirEvento({
        tipo: "pedido.pago",
        orgId,
        brandId,
        entidade: "pedido",
        entidadeId: pedidoId,
        payload: { status: "pago", statusAnterior: atual.status, origemStatus: novoStatus },
      }, tx));
    }

    const eventoPorStatus: Partial<Record<typeof novoStatus, DomainEventType>> = {
      enviado: "pedido.enviado",
      entregue: "pedido.entregue",
      concluido: "pedido.entregue",
      cancelado: "pedido.cancelado",
      devolvido: "pedido.devolvido",
    };
    const tipoEvento = eventoPorStatus[novoStatus];
    if (tipoEvento) {
      eventos.push(await persistirEvento({
        tipo: tipoEvento,
        orgId,
        brandId,
        entidade: "pedido",
        entidadeId: pedidoId,
        payload: { status: novoStatus, statusAnterior: atual.status, origemStatus: statusExterno },
      }, tx));
    }
    return eventos;
  });

  for (const evento of resultado) await despacharEvento(evento);
  if (resultado.length === 0) {
    // Uma repetição também atua como recuperação do outbox caso a primeira
    // publicação tenha falhado depois do commit do pedido.
    const recuperacao = await despacharEventosPendentes(orgId, 100);
    if (recuperacao.falhas > 0) {
      throw new Error(`Falha ao republicar ${recuperacao.falhas} evento(s) pendente(s) do pedido.`);
    }
  }
}
