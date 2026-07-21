import { inngest } from "@/shared/lib/inngest/client";
import { db } from "@/shared/lib/db";
import { regua } from "@/shared/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { dispararRegua } from "@/modules/reguas/application/reguas.service";

export const A9_reguaAniversario = inngest.createFunction(
  { id: "A9-regua-aniversario", name: "A9 — Régua de aniversário (cron diário 9h)", concurrency: { limit: 1 }, triggers: [{ cron: "0 9 * * *" }] },
  async ({ step }) => {
    const orgId = process.env.DEFAULT_ORG_ID ?? "";

    const aniversariantes = await step.run("buscar-aniversariantes", async () => {
      return [] as { clienteId: string; brandId: string; canal: string }[];
    });

    const reguasAniversario = await step.run("buscar-reguas", () =>
      db.select().from(regua).where(
        and(eq(regua.orgId, orgId), eq(regua.gatilho, "aniversario"), eq(regua.status, "ativa"))
      )
    );

    let disparos = 0;
    for (const aniversariante of aniversariantes) {
      for (const r of reguasAniversario) {
        if (r.brandId !== aniversariante.brandId) continue;
        await dispararRegua({
          orgId,
          reguaId: r.id,
          clienteId: aniversariante.clienteId,
          brandId: aniversariante.brandId,
          canalOrigem: aniversariante.canal,
          gatilhoData: new Date(),
        });
        disparos++;
      }
    }

    return { aniversariantes: aniversariantes.length, disparos };
  }
);
