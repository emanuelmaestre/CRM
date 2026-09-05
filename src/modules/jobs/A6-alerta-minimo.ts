import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { inngest } from "@/shared/lib/inngest/client";
import { db } from "@/shared/lib/db";
import { estoqueCanalSaldo, produto } from "@/shared/lib/db/schema";
import { emitirEventoUnico } from "@/shared/events";
import { SALDO_FRESCOR_MS } from "@/modules/estoque/infrastructure/saldo-canais";

/** Alerta de estoque mínimo.
 *
 *  Antes reagia à baixa automática do saldo local, evento que deixou de existir
 *  junto com o livro-razão. Agora varre o estoque logo depois da coleta dos
 *  canais (A5, 6h): o saldo do produto é o maior entre os canais, porque o mesmo
 *  lote físico é anunciado em todos eles. */
export const A6_alertaMinimo = inngest.createFunction(
  {
    id: "A6-alerta-minimo",
    name: "A6 — Alerta de estoque mínimo",
    concurrency: { limit: 1 },
    triggers: [{ cron: "30 3 * * *" }],
  },
  async ({ step }) => {
    const orgId = process.env.DEFAULT_ORG_ID ?? "";
    const confirmadoDesde = new Date(Date.now() - SALDO_FRESCOR_MS);

    const abaixoDoMinimo = await step.run("buscar-abaixo-do-minimo", () =>
      db
        .select({
          produtoId: produto.id,
          sku: produto.sku,
          brandId: produto.brandId,
          minimo: produto.estoqueMinimo,
          saldo: sql<number>`max(${estoqueCanalSaldo.saldo})`,
        })
        .from(produto)
        .innerJoin(estoqueCanalSaldo, and(
          eq(estoqueCanalSaldo.produtoId, produto.id),
          eq(estoqueCanalSaldo.orgId, produto.orgId),
        ))
        .where(and(
          eq(produto.orgId, orgId),
          eq(produto.ativo, true),
          isNull(produto.deletedAt),
          gte(estoqueCanalSaldo.verificadoEm, confirmadoDesde),
        ))
        .groupBy(produto.id, produto.sku, produto.brandId, produto.estoqueMinimo)
        .having(sql`max(${estoqueCanalSaldo.saldo}) <= ${produto.estoqueMinimo}`),
    );

    const alertados = await step.run("emitir-alertas", async () => {
      for (const item of abaixoDoMinimo) {
        await emitirEventoUnico({
          tipo: "estoque.minimo_atingido",
          orgId,
          brandId: item.brandId,
          entidade: "produto",
          entidadeId: item.produtoId,
          payload: { sku: item.sku, saldoAtual: item.saldo, minimo: item.minimo },
        }, 24 * 60);
      }
      return abaixoDoMinimo.length;
    });

    return { alertados };
  },
);
