import { inngest } from "@/shared/lib/inngest/client";
import { db } from "@/shared/lib/db";
import { pedidoItem } from "@/shared/lib/db/schema";
import { eq } from "drizzle-orm";
import { registrarMovimento } from "@/modules/estoque/application/estoque.service";

export const A3_estornoEstoque = inngest.createFunction(
  { id: "A3-estorno-estoque", name: "A3 — Estorno de estoque no pedido.cancelado", triggers: [{ event: "pedido/cancelado" }] },
  async ({ event, step }) => {
    const { entityId: pedidoId, orgId, statusAnterior } = event.data as { entityId: string; orgId: string; statusAnterior: string };

    if (!["pago", "separado"].includes(statusAnterior)) {
      return { pedidoId, estornado: false, motivo: "Estoque nunca foi baixado neste status" };
    }

    const itens = await step.run("buscar-itens", () =>
      db.select().from(pedidoItem).where(eq(pedidoItem.pedidoId, pedidoId))
    );

    for (const item of itens) {
      await step.run(`estorno-${item.produtoId}`, () =>
        registrarMovimento(
          { db, orgId, perfil: "admin" as const },
          { produtoId: item.produtoId, tipo: "estorno", quantidade: item.quantidade, referenciaId: pedidoId, referenciaTipo: "pedido_cancelado" }
        )
      );
    }

    return { pedidoId, estornado: true, itensProcessados: itens.length };
  }
);
