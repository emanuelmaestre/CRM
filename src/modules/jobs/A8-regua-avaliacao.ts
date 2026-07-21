import { inngest } from "@/shared/lib/inngest/client";
import { db } from "@/shared/lib/db";
import { pedido, regua } from "@/shared/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { dispararRegua } from "@/modules/reguas/application/reguas.service";

export const A8_reguaAvaliacao = inngest.createFunction(
  { id: "A8-regua-avaliacao", name: "A8 — Régua de avaliação pós-entrega", triggers: [{ event: "pedido/entregue" }] },
  async ({ event, step }) => {
    const { entityId: pedidoId, orgId, brandId } = event.data as { entityId: string; orgId: string; brandId: string };

    const pedidoRow = await step.run("buscar-pedido", () =>
      db.select().from(pedido).where(eq(pedido.id, pedidoId)).then((r) => r[0])
    );

    if (!pedidoRow) return { disparado: false, motivo: "Pedido não encontrado" };

    const reguasAvaliacao = await step.run("buscar-reguas", () =>
      db.select().from(regua).where(
        and(eq(regua.orgId, orgId), eq(regua.brandId, brandId), eq(regua.gatilho, "pedido_entregue"), eq(regua.status, "ativa"))
      )
    );

    const resultados = [];
    for (const r of reguasAvaliacao) {
      const resultado = await step.run(`disparar-regua-${r.id}`, () =>
        dispararRegua({
          orgId,
          reguaId: r.id,
          clienteId: pedidoRow.clienteId,
          brandId,
          canalOrigem: pedidoRow.canal,
          gatilhoData: new Date(),
        })
      );
      resultados.push({ reguaId: r.id, ...resultado });
    }

    return { pedidoId, disparos: resultados.length, resultados };
  }
);
