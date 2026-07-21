import { inngest } from "@/shared/lib/inngest/client";
import { db } from "@/shared/lib/db";
import { estoqueSaldo } from "@/shared/lib/db/schema";
import { eq } from "drizzle-orm";
import { emitirEvento } from "@/shared/events";

export const A5_reconciliacaoSaldo = inngest.createFunction(
  { id: "A5-reconciliacao-saldo", name: "A5 — Reconciliação noturna de saldo", concurrency: { limit: 1 }, triggers: [{ cron: "0 3 * * *" }] },
  async ({ step }) => {
    const orgId = process.env.DEFAULT_ORG_ID ?? "";
    const saldos = await step.run("buscar-saldos", () =>
      db.select().from(estoqueSaldo).where(eq(estoqueSaldo.orgId, orgId))
    );

    const divergencias: string[] = [];

    for (const saldo of saldos) {
      if (saldo.saldo < 0) {
        divergencias.push(saldo.produtoId);
        await emitirEvento({
          tipo: "estoque.divergencia_detectada",
          orgId,
          entidade: "estoque_saldo",
          entidadeId: saldo.id,
          payload: { produtoId: saldo.produtoId, saldo: saldo.saldo, motivo: "Saldo negativo detectado" },
        });
      }
    }

    return { verificados: saldos.length, divergencias: divergencias.length };
  }
);
