import { inngest } from "@/shared/lib/inngest/client";
import { db } from "@/shared/lib/db";
import { produto } from "@/shared/lib/db/schema";
import { eq } from "drizzle-orm";
import { emitirEvento } from "@/shared/events";

export const A6_alertaMinimo = inngest.createFunction(
  { id: "A6-alerta-minimo", name: "A6 — Alerta de estoque mínimo", triggers: [{ event: "estoque/baixa-automatica" }] },
  async ({ event, step }) => {
    const { produtoId, orgId, novoSaldo } = event.data as { produtoId: string; orgId: string; novoSaldo: number };

    const produtoRow = await step.run("verificar-minimo", () =>
      db.select().from(produto).where(eq(produto.id, produtoId)).then((r) => r[0])
    );

    if (!produtoRow) return { alertado: false };

    if (novoSaldo <= produtoRow.estoqueMinimo) {
      await emitirEvento({
        tipo: "estoque.minimo_atingido",
        orgId,
        entidade: "produto",
        entidadeId: produtoId,
        payload: { sku: produtoRow.sku, saldoAtual: novoSaldo, minimo: produtoRow.estoqueMinimo },
      });
      return { alertado: true, sku: produtoRow.sku, saldo: novoSaldo };
    }

    return { alertado: false };
  }
);
