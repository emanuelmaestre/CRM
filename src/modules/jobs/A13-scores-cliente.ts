import { inngest } from "@/shared/lib/inngest/client";
import { db } from "@/shared/lib/db";
import { cliente } from "@/shared/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { recalcularScoreCliente } from "@/modules/scoring/application/scoring.service";

export const A13_scoresCliente = inngest.createFunction(
  { id: "A13-scores-cliente", name: "A13 — Recálculo noturno de scores de cliente", concurrency: { limit: 1 }, triggers: [{ cron: "0 2 * * *" }] },
  async ({ step }) => {
    const orgId = process.env.DEFAULT_ORG_ID ?? "";

    const clientes = await step.run("listar-clientes", () =>
      db.select({ id: cliente.id })
        .from(cliente)
        .where(and(eq(cliente.orgId, orgId), isNull(cliente.deletedAt)))
        .limit(1000)
    );

    let processados = 0;
    for (const c of clientes) {
      await step.run(`score-${c.id}`, () => recalcularScoreCliente(orgId, c.id));
      processados++;
    }

    return { processados };
  }
);
