"use server";

import { revalidatePath } from "next/cache";
import { getCrudContext } from "@/shared/lib/get-crud-context";
import {
  contarPedidosIgnoradosAbertos,
  descartarPedidoIgnorado,
  listarPedidosIgnorados,
  reprocessarPedidoIgnorado,
} from "@/modules/vendas/application/pedidos-ignorados.service";

export async function actionContarPedidosIgnorados() {
  const ctx = await getCrudContext();
  return contarPedidosIgnoradosAbertos(ctx);
}

export async function actionListarPedidosIgnorados(incluirFechados = false) {
  const ctx = await getCrudContext();
  const linhas = await listarPedidosIgnorados(ctx, { incluirFechados });
  return {
    linhas,
    // Descartar tira um pedido da fila para sempre até alguém desfazer — é
    // decisão de quem responde pela operação, não de qualquer login.
    permissions: { podeDescartar: ctx.perfil === "admin" || ctx.perfil === "gestor" },
  };
}

export async function actionReprocessarPedidoIgnorado(id: string) {
  const ctx = await getCrudContext();
  const resultado = await reprocessarPedidoIgnorado(ctx, id);
  revalidatePath("/vendas/pedidos-ignorados");
  revalidatePath("/vendas");
  return resultado;
}

export async function actionDescartarPedidoIgnorado(id: string, desfazer = false) {
  const ctx = await getCrudContext();
  if (ctx.perfil !== "admin" && ctx.perfil !== "gestor") {
    throw new Error("Sem permissão para descartar pendências.");
  }
  await descartarPedidoIgnorado(ctx, id, desfazer);
  revalidatePath("/vendas/pedidos-ignorados");
}
