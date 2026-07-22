import { inngest } from "@/shared/lib/inngest/client";
import { db } from "@/shared/lib/db";
import { cliente, pedido, regua } from "@/shared/lib/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { dispararRegua } from "@/modules/reguas/application/reguas.service";

export const A9_reguaAniversario = inngest.createFunction(
  { id: "A9-regua-aniversario", name: "A9 — Régua de aniversário (cron diário 9h)", concurrency: { limit: 1 }, triggers: [{ cron: "0 9 * * *" }] },
  async ({ step }) => {
    const orgId = process.env.DEFAULT_ORG_ID ?? "";

    const aniversariantes = await step.run("buscar-aniversariantes", async () => {
      const candidatos = await db
        .selectDistinct({ clienteId: cliente.id, brandId: pedido.brandId, canal: pedido.canal })
        .from(cliente)
        .innerJoin(pedido, and(eq(pedido.clienteId, cliente.id), eq(pedido.orgId, cliente.orgId)))
        .where(and(
          eq(cliente.orgId, orgId),
          isNull(cliente.deletedAt),
          sql`extract(month from ${cliente.dataNascimento}) = extract(month from (now() at time zone 'America/Sao_Paulo'))`,
          sql`extract(day from ${cliente.dataNascimento}) = extract(day from (now() at time zone 'America/Sao_Paulo'))`,
        ));

      const unicos = new Map<string, { clienteId: string; brandId: string; canal: string }>();
      for (const candidato of candidatos) {
        unicos.set(`${candidato.clienteId}:${candidato.brandId}`, candidato);
      }
      return [...unicos.values()];
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
