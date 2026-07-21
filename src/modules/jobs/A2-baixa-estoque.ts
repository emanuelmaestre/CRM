import { inngest } from "@/shared/lib/inngest/client";
import { db } from "@/shared/lib/db";
import { pedidoItem } from "@/shared/lib/db/schema";
import { eq } from "drizzle-orm";
import { registrarMovimento } from "@/modules/estoque/application/estoque.service";

export const A2_baixaEstoque = inngest.createFunction(
  { id: "A2-baixa-estoque", name: "A2 — Baixa automática de estoque no pedido.pago", triggers: [{ event: "pedido/pago" }] },
  async ({ event, step }) => {
    const { pedidoId, orgId } = event.data as { pedidoId: string; orgId: string };

    const itens = await step.run("buscar-itens", () =>
      db.select().from(pedidoItem).where(eq(pedidoItem.pedidoId, pedidoId))
    );

    for (const item of itens) {
      await step.run(`baixa-${item.produtoId}`, () =>
        registrarMovimento(
          { db, orgId, perfil: "admin" as const },
          { produtoId: item.produtoId, tipo: "saida", quantidade: item.quantidade, referenciaId: pedidoId, referenciaTipo: "pedido" }
        )
      );
    }

    return { pedidoId, itensProcessados: itens.length };
  }
);
