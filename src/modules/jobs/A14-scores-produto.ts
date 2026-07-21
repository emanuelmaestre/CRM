import { inngest } from "@/shared/lib/inngest/client";
import { db } from "@/shared/lib/db";
import { produto } from "@/shared/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { recalcularScoreProduto } from "@/modules/scoring/application/scoring.service";

export const A14_scoresProduto = inngest.createFunction(
  { id: "A14-scores-produto", name: "A14 — Recálculo noturno de scores de produto", concurrency: { limit: 1 }, triggers: [{ cron: "0 2 * * *" }] },
  async ({ step }) => {
    const orgId = process.env.DEFAULT_ORG_ID ?? "";

    const produtos = await step.run("listar-produtos", () =>
      db.select({ id: produto.id })
        .from(produto)
        .where(and(eq(produto.orgId, orgId), isNull(produto.deletedAt), eq(produto.ativo, true)))
        .limit(500)
    );

    let processados = 0;
    for (const p of produtos) {
      await step.run(`score-produto-${p.id}`, () => recalcularScoreProduto(orgId, p.id));
      processados++;
    }

    return { processados };
  }
);
