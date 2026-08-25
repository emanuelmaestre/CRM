import { inngest } from "@/shared/lib/inngest/client";
import { db } from "@/shared/lib/db";
import { cliente } from "@/shared/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { recalcularScoreCliente } from "@/modules/scoring/application/scoring.service";

export const A13_scoresCliente = inngest.createFunction(
  { id: "A13-scores-cliente", name: "A13 — Recálculo noturno de scores de cliente", concurrency: { limit: 1 }, triggers: [{ cron: "0 2 * * *" }] },
  async ({ step }) => {
    const orgId = process.env.DEFAULT_ORG_ID ?? "";

    let processados = 0;
    let offset = 0;
    const TAMANHO_PAGINA = 200;
    const TAMANHO_LOTE = 20;

    while (true) {
      const clientes = await step.run(`listar-clientes-${offset}`, () =>
        db.select({ id: cliente.id })
          .from(cliente)
          .where(and(eq(cliente.orgId, orgId), isNull(cliente.deletedAt)))
          .orderBy(cliente.id)
          .limit(TAMANHO_PAGINA)
          .offset(offset),
      );
      if (clientes.length === 0) break;

      for (let inicio = 0; inicio < clientes.length; inicio += TAMANHO_LOTE) {
        const lote = clientes.slice(inicio, inicio + TAMANHO_LOTE);
        await step.run(`scores-clientes-${offset + inicio}`, async () => {
          const resultados = await Promise.allSettled(
            lote.map((item) => recalcularScoreCliente(orgId, item.id)),
          );
          const falhas = resultados.filter((resultado) => resultado.status === "rejected");
          if (falhas.length > 0) {
            throw new Error(`Falha ao recalcular ${falhas.length} de ${lote.length} scores de cliente.`);
          }
          return { processados: lote.length };
        });
        processados += lote.length;
      }

      if (clientes.length < TAMANHO_PAGINA) break;
      offset += TAMANHO_PAGINA;
    }

    return { processados };
  }
);
