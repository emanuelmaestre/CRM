import { inngest } from "@/shared/lib/inngest/client";
import { db } from "@/shared/lib/db";
import { scoreCliente, regua } from "@/shared/lib/db/schema";
import { and, eq, gte } from "drizzle-orm";
import { dispararRegua } from "@/modules/reguas/application/reguas.service";

export const A10_reguaReativacao = inngest.createFunction(
  { id: "A10-regua-reativacao", name: "A10 — Régua de reativação (cron diário)", concurrency: { limit: 1 }, triggers: [{ cron: "0 10 * * 1-5" }] },
  async ({ step }) => {
    const orgId = process.env.DEFAULT_ORG_ID ?? "";

    const clientesEmRisco = await step.run("buscar-clientes-em-risco", () =>
      db.select({ clienteId: scoreCliente.clienteId })
        .from(scoreCliente)
        .where(and(eq(scoreCliente.orgId, orgId), gte(scoreCliente.churnRisk, 70)))
        .limit(100)
    );

    const reguasReativacao = await step.run("buscar-reguas", () =>
      db.select().from(regua).where(
        and(eq(regua.orgId, orgId), eq(regua.gatilho, "sem_compra"), eq(regua.status, "ativa"))
      )
    );

    let disparos = 0;
    for (const { clienteId } of clientesEmRisco) {
      for (const r of reguasReativacao) {
        const resultado = await step.run(`reativacao-${clienteId}-${r.id}`, () =>
          dispararRegua({
            orgId,
            reguaId: r.id,
            clienteId,
            brandId: r.brandId,
            canalOrigem: "manual",
            gatilhoData: new Date(),
          })
        );
        if (resultado.status === "enviada") disparos++;
      }
    }

    return { clientesAvaliados: clientesEmRisco.length, disparos };
  }
);
