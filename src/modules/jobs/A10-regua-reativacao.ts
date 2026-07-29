import { inngest } from "@/shared/lib/inngest/client";
import { db } from "@/shared/lib/db";
import { scoreCliente, regua, pedido } from "@/shared/lib/db/schema";
import { and, eq, gte, inArray } from "drizzle-orm";
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

    // Origem real do cliente por marca (canal do último pedido conhecido), para
    // o Gate 2 (isolamento de canal de marketplace) poder ser aplicado aqui
    // como já acontece em A8/A9. Sem isso, "canalOrigem" caía sempre em
    // "manual" e o gate nunca bloqueava reativação de clientes de marketplace.
    const origens = await step.run("buscar-origem-clientes", async () => {
      if (clientesEmRisco.length === 0) return [];
      return db
        .selectDistinct({ clienteId: pedido.clienteId, brandId: pedido.brandId, canal: pedido.canal })
        .from(pedido)
        .where(and(eq(pedido.orgId, orgId), inArray(pedido.clienteId, clientesEmRisco.map((c) => c.clienteId))));
    });
    // Mapa montado fora do step: o retorno de step.run é serializado em JSON
    // pelo Inngest para memoização, e um Map não sobrevive a esse round-trip.
    const origensPorClienteMarca = new Map(origens.map((o) => [`${o.clienteId}:${o.brandId}`, o.canal]));

    let disparos = 0;
    for (const { clienteId } of clientesEmRisco) {
      for (const r of reguasReativacao) {
        const canalOrigem = origensPorClienteMarca.get(`${clienteId}:${r.brandId}`) ?? "manual";
        const resultado = await step.run(`reativacao-${clienteId}-${r.id}`, () =>
          dispararRegua({
            orgId,
            reguaId: r.id,
            clienteId,
            brandId: r.brandId,
            canalOrigem,
            gatilhoData: new Date(),
          })
        );
        if (resultado.status === "enviada") disparos++;
      }
    }

    return { clientesAvaliados: clientesEmRisco.length, disparos };
  }
);
