"use server";

import { eq, and } from "drizzle-orm";
import { db } from "@/shared/lib/db";
import { cliente, clienteIdentidade } from "@/shared/lib/db/schema/clientes";
import { pedido } from "@/shared/lib/db/schema/vendas";
import { emitirEvento } from "@/shared/events";
import type { PedidoNormalizado } from "../domain/ports";

type CanalSuportado = "shopee" | "mercadolivre" | "tiktokshop";

function toCanal(canal: string): CanalSuportado {
  if (canal === "shopee" || canal === "mercadolivre" || canal === "tiktokshop") return canal;
  return "shopee";
}

export async function ingerirPedido(
  orgId: string,
  brandId: string,
  p: PedidoNormalizado
): Promise<{ pedidoId: string; novo: boolean }> {
  const existente = await db
    .select({ id: pedido.id })
    .from(pedido)
    .where(and(eq(pedido.providerOrderId, p.providerOrderId), eq(pedido.orgId, orgId)))
    .then((r) => r[0]);

  if (existente) return { pedidoId: existente.id, novo: false };

  const canal = toCanal(p.canal);

  let clienteId: string | undefined;

  const identidade = await db
    .select({ clienteId: clienteIdentidade.clienteId })
    .from(clienteIdentidade)
    .where(
      and(
        eq(clienteIdentidade.canal, canal),
        eq(clienteIdentidade.externalId, p.clienteExternalId)
      )
    )
    .then((r) => r[0]);

  if (identidade) {
    clienteId = identidade.clienteId;
  } else {
    const [novoCliente] = await db
      .insert(cliente)
      .values({ orgId, nome: p.clienteNome, email: p.clienteEmail, telefone: p.clienteTelefone })
      .returning({ id: cliente.id });

    clienteId = novoCliente.id;

    await db.insert(clienteIdentidade).values({
      clienteId,
      orgId,
      canal,
      externalId: p.clienteExternalId,
    });
  }

  const [novoPedido] = await db
    .insert(pedido)
    .values({
      orgId,
      brandId,
      clienteId,
      providerOrderId: p.providerOrderId,
      canal: p.canal,
      status: mapearStatus(p.status),
      total: p.total,
      frete: p.frete ?? "0",
    })
    .returning({ id: pedido.id });

  await emitirEvento({
    tipo: "pedido.recebido",
    orgId,
    brandId,
    entidade: "pedido",
    entidadeId: novoPedido.id,
    payload: { canal: p.canal, providerOrderId: p.providerOrderId, total: p.total },
  });

  return { pedidoId: novoPedido.id, novo: true };
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
