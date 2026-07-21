import { inngest } from "@/shared/lib/inngest/client";
import { db } from "@/shared/lib/db";
import { produto, estoqueSaldo, estoqueMovimento } from "@/shared/lib/db/schema";
import { and, eq, lt, sql } from "drizzle-orm";
import { calcularScoreProduto } from "@/modules/scoring/domain/encalhe";
import { emitirEvento } from "@/shared/events";

const DIAS_SEM_VENDA = 30;

export const A7_encalhe = inngest.createFunction(
  {
    id: "A7-encalhe",
    name: "A7 — Detecção noturna de encalhe de produto",
    concurrency: { limit: 1 },
    triggers: [{ cron: "0 2 * * *" }],
  },
  async ({ step }) => {
    const orgId = process.env.DEFAULT_ORG_ID ?? "";
    const limiteData = new Date(Date.now() - DIAS_SEM_VENDA * 24 * 60 * 60 * 1000);

    const candidatos = await step.run("buscar-candidatos", () =>
      db
        .select({ id: produto.id, sku: produto.sku, custo: produto.custo, brandId: produto.brandId })
        .from(produto)
        .innerJoin(estoqueSaldo, eq(estoqueSaldo.produtoId, produto.id))
        .where(and(
          eq(produto.orgId, orgId),
          eq(produto.ativo, true),
          lt(estoqueSaldo.saldo, sql`0`),
        ))
    );

    const alertas: string[] = [];

    for (const prod of candidatos) {
      const ultimaVenda = await step.run(`ultima-venda-${prod.id}`, () =>
        db
          .select({ criado: estoqueMovimento.createdAt })
          .from(estoqueMovimento)
          .where(and(
            eq(estoqueMovimento.orgId, orgId),
            eq(estoqueMovimento.produtoId, prod.id),
            eq(estoqueMovimento.tipo, "saida"),
          ))
          .orderBy(sql`${estoqueMovimento.createdAt} desc`)
          .limit(1)
          .then((r) => r[0]?.criado ?? null)
      );

      const diasSemVenda = ultimaVenda
        ? Math.floor((Date.now() - new Date(ultimaVenda).getTime()) / 86400000)
        : DIAS_SEM_VENDA + 1;

      if (diasSemVenda < DIAS_SEM_VENDA) continue;

      const saldoRow = await step.run(`saldo-${prod.id}`, () =>
        db
          .select({ saldo: estoqueSaldo.saldo })
          .from(estoqueSaldo)
          .where(and(eq(estoqueSaldo.orgId, orgId), eq(estoqueSaldo.produtoId, prod.id)))
          .then((r) => r[0])
      );

      if (!saldoRow || saldoRow.saldo <= 0) continue;

      const score = calcularScoreProduto({
        diasSemVenda,
        giroMensalMedio: 0,
        saldoAtual: saldoRow.saldo,
        custoUnitario: parseFloat(prod.custo ?? "0"),
      });

      if (score.riscoEncalhe >= 30) {
        alertas.push(prod.id);
        await step.run(`evento-encalhe-${prod.id}`, () =>
          emitirEvento({
            tipo: "estoque.parado_detectado",
            orgId,
            brandId: prod.brandId,
            entidade: "produto",
            entidadeId: prod.id,
            payload: {
              sku: prod.sku,
              diasSemVenda,
              riscoEncalhe: score.riscoEncalhe,
              capitalParado: score.capitalParado,
              acaoSugerida: score.acaoSugerida,
              versaoFormula: score.versaoFormula,
            },
          })
        );
      }
    }

    return { verificados: candidatos.length, alertas: alertas.length, cutoff: limiteData.toISOString() };
  }
);
