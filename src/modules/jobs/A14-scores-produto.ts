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
    const TAMANHO_PAGINA = 200;
    const TAMANHO_LOTE = 20;
    while (true) {
      const lote = await step.run(`listar-produtos-${offset}`, () =>
        db.select({ id: produto.id })
          .from(produto)
          .where(and(eq(produto.orgId, orgId), isNull(produto.deletedAt), eq(produto.ativo, true)))
          .orderBy(produto.id)
          .limit(TAMANHO_PAGINA)
          .offset(offset)
      );
      if (lote.length === 0) break;

      for (let inicio = 0; inicio < lote.length; inicio += TAMANHO_LOTE) {
        const sublote = lote.slice(inicio, inicio + TAMANHO_LOTE);
        await step.run(`scores-produtos-${offset + inicio}`, async () => {
          const resultados = await Promise.allSettled(
            sublote.map((item) => recalcularScoreProduto(orgId, item.id)),
          );
          const falhas = resultados.filter((resultado) => resultado.status === "rejected");
          if (falhas.length > 0) {
            throw new Error(`Falha ao recalcular ${falhas.length} de ${sublote.length} scores de produto.`);
          }
          return { processados: sublote.length };
        });
        processados += sublote.length;
      }

      if (lote.length < TAMANHO_PAGINA) break;
      offset += TAMANHO_PAGINA;
    }

    return { processados };
  }
);
