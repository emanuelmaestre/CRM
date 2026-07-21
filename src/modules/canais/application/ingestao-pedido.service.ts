"use server";

import { eq, and, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/shared/lib/db";
import { cliente, clienteIdentidade } from "@/shared/lib/db/schema/clientes";
import { produto } from "@/shared/lib/db/schema/estoque";
import { pedido, pedidoItem } from "@/shared/lib/db/schema/vendas";
import { despacharEvento, persistirEvento, type PersistedDomainEvent } from "@/shared/events";
import type { PedidoNormalizado } from "../domain/ports";

type CanalSuportado = "shopee" | "mercadolivre" | "tiktokshop";

function toCanal(canal: string): CanalSuportado {
  if (canal === "shopee" || canal === "mercadolivre" || canal === "tiktokshop") return canal;
  throw new Error(`Canal de pedido nÃ£o suportado: ${canal}.`);
}

const PedidoIngestaoSchema = z.object({
  orgId: z.uuid(),
  brandId: z.uuid(),
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
  p: PedidoNormalizado
): Promise<{ pedidoId: string; novo: boolean }> {
  PedidoIngestaoSchema.parse({ orgId, brandId, ...p });
  const canal = toCanal(p.canal);

  const existente = await db
    .select({ id: pedido.id })
    .from(pedido)
    .where(and(
      eq(pedido.providerOrderId, p.providerOrderId),
      eq(pedido.canal, canal),
      eq(pedido.orgId, orgId),
    ))
    .then((r) => r[0]);

  if (existente) return { pedidoId: existente.id, novo: false };

  const { pedidoId, eventos } = await db.transaction(async (tx) => {
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
      payload: { canal, providerOrderId: p.providerOrderId, total: p.total },
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

    return { pedidoId: novoPedido.id, eventos };
  });

  for (const evento of eventos) await despacharEvento(evento);

  return { pedidoId, novo: true };
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
