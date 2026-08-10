import { inngest } from "@/shared/lib/inngest/client";
import { db } from "@/shared/lib/db";
import { produto } from "@/shared/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { recalcularScoreProduto } from "@/modules/scoring/application/scoring.service";

export const A14_scoresProduto = inngest.createFunction(
  { id: "A14-scores-produto", name: "A14 — Recálculo noturno de scores de produto", concurrency: { limit: 1 }, triggers: [{ cron: "0 2 * * *" }] },
  async ({ step }) => {
    const orgId = process.env.DEFAULT_ORG_ID ?? "";

    // Paginado em vez de um único limit(500): a importação de catálogo do ML
    // (ver actionImportarCatalogoEstoque) traz centenas de SKUs de uma vez —
    // um teto fixo deixava os produtos além dele sem score recalculado toda
    // noite, silenciosamente.
    let processados = 0;
    let offset = 0;
    const TAMANHO_LOTE = 200;
    while (true) {
      const lote = await step.run(`listar-produtos-${offset}`, () =>
        db.select({ id: produto.id })
          .from(produto)
          .where(and(eq(produto.orgId, orgId), isNull(produto.deletedAt), eq(produto.ativo, true)))
          .orderBy(produto.id)
          .limit(TAMANHO_LOTE)
          .offset(offset)
      );
      if (lote.length === 0) break;

      for (const p of lote) {
        await step.run(`score-produto-${p.id}`, () => recalcularScoreProduto(orgId, p.id));
        processados++;
      }

      if (lote.length < TAMANHO_LOTE) break;
      offset += TAMANHO_LOTE;
    }

    return { processados };
  }
);
