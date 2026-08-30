"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCrudContext } from "@/shared/lib/get-crud-context";
import {
  cancelarPedido, contarPedidosPorCanal, contarPedidosPorMarca, listarPedidosDetalhados,
  listarPedidosNoLimiteDoDia, resumirPedidos,
} from "@/modules/vendas/application/pedidos.service";
import { normalizarConsultaPedidos } from "@/modules/vendas/domain/consulta-pedidos";
import { resumirPedidosIgnorados } from "@/modules/vendas/application/pedidos-ignorados.service";

/* ── Pedidos ──────────────────────────────────────────────────────────── */

export async function actionListarPedidosDetalhados(opts: {
  brandIds?: string[];
  canais?: string[];
  statuses?: string[];
  busca?: string;
  inicio?: string;
  fim?: string;
  offset?: number;
} = {}) {
  const ctx = await getCrudContext();
  const { offset, ...filtros } = normalizarConsultaPedidos(opts);
  const [result, resumo, marcas, canais, limiteDoDia, pendencias] = await Promise.all([
    listarPedidosDetalhados(ctx, {
      ...filtros,
      limit: 50,
      offset,
    }),
    resumirPedidos(ctx, filtros),
    contarPedidosPorMarca(ctx, { canais: filtros.canais }),
    contarPedidosPorCanal(ctx, { brandIds: filtros.brandIds }),
    /* Viaja junto da lista de propósito: é a mesma seleção, e uma ida
       separada abriria a janela em que o aviso fala de um período que a tela
       já trocou. Sem recorte de data ou sem o Mercado Livre no filtro, a
       consulta devolve vazio sem tocar no banco. */
    listarPedidosNoLimiteDoDia(ctx, filtros),
    /* Viaja junto pelo mesmo motivo do limite do dia: é a terceira parcela da
       conferência com o painel do canal, e buscá-la em outra ida abriria a
       janela em que a tela soma um período com o valor de outro. */
    resumirPedidosIgnorados(ctx, {
      brandIds: filtros.brandIds,
      canais: filtros.canais,
      inicio: filtros.inicio,
      fim: filtros.fim,
    }),
  ]);
  return {
    ...result,
    resumo,
    marcas,
    canais,
    limiteDoDia,
    pendencias,
    permissions: { canManage: ctx.perfil === "admin" || ctx.perfil === "gestor" },
  };
}

export async function actionContarPedidosPorMarca(canais?: string[]) {
  const ctx = await getCrudContext();
  const { canais: canaisValidados } = normalizarConsultaPedidos({ canais });
  return contarPedidosPorMarca(ctx, { canais: canaisValidados });
}

export async function actionContarPedidosPorCanal(brandIds?: string[]) {
  const ctx = await getCrudContext();
  const { brandIds: marcasValidadas } = normalizarConsultaPedidos({ brandIds });
  return contarPedidosPorCanal(ctx, { brandIds: marcasValidadas });
}

export async function actionObterFiltrosPedidos() {
  const ctx = await getCrudContext();
  const [marcas, canais] = await Promise.all([
    contarPedidosPorMarca(ctx),
    contarPedidosPorCanal(ctx),
  ]);
  return { marcas, canais };
}

export async function actionCancelarPedido(pedidoId: string, motivo: string) {
  const ctx = await getCrudContext();
  const id = z.string().uuid().parse(pedidoId);
  const result = await cancelarPedido(ctx, id, motivo);
  revalidatePath("/vendas/pedidos");
  revalidatePath(`/vendas/pedidos/${id}`);
  return result;
}
