"use server";

import { eq, and, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/shared/lib/db";
import { cliente, clienteIdentidade } from "@/shared/lib/db/schema/clientes";
import { channelAccount } from "@/shared/lib/db/schema/canais";
import { produto } from "@/shared/lib/db/schema/estoque";
import { pedido, pedidoItem } from "@/shared/lib/db/schema/vendas";
import { despacharEvento, persistirEvento, type PersistedDomainEvent } from "@/shared/events";
import type { PedidoNormalizado } from "../domain/ports";

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

  if (existente) return { pedidoId: existente.id, novo: false };

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
      .select({ id: produto.id, sku: produto.sku })
      .from(produto)
      .where(and(
        eq(produto.orgId, orgId),
        eq(produto.brandId, brandId),
        inArray(produto.sku, skus),
      ));
    const produtoPorSku = new Map(produtos.map((item) => [item.sku, item.id]));
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

    const status = mapearStatus(p.status);
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
    return { pedidoId: concorrente.id, novo: false };
  }

  const { pedidoId, eventos, novo } = persistido;

  if (!novo) return { pedidoId, novo: false };

  for (const evento of eventos) await despacharEvento(evento);

  return { pedidoId, novo: true };
}

function isPedidoDuplicado(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { code?: string; constraint_name?: string; constraint?: string };
  const constraint = candidate.constraint_name ?? candidate.constraint;
  return candidate.code === "23505" && constraint === "uq_pedido_org_account_provider";
}

function mapearStatus(statusExterno: string): "criado" | "pago" | "separado" | "enviado" | "entregue" | "concluido" | "cancelado" | "devolvido" {
  const mapa: Record<string, "criado" | "pago" | "separado" | "enviado" | "entregue" | "concluido" | "cancelado" | "devolvido"> = {
    unpaid: "criado",
    to_pay: "criado",
    paid: "pago",
    ready_to_ship: "separado",
    shipped: "enviado",
    in_cancel: "cancelado",
    cancelled: "cancelado",
    completed: "concluido",
    returned: "devolvido",
    payment_pending: "criado",
    payment_done: "pago",
    delivered: "entregue",
  };
  return mapa[statusExterno] ?? "criado";
}
