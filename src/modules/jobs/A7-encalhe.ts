import { inngest } from "@/shared/lib/inngest/client";
import { db } from "@/shared/lib/db";
import { produto, estoqueCanalSaldo, pedido, pedidoItem } from "@/shared/lib/db/schema";
import { and, eq, notInArray, sql } from "drizzle-orm";
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

    // Saldo do produto = maior saldo entre os canais (mesmo lote anunciado em
    // todos eles). Uma agregação só, em vez de uma consulta por produto.
    const candidatos = await step.run("buscar-candidatos", () =>
      db
        .select({
          id: produto.id, sku: produto.sku, preco: produto.preco, brandId: produto.brandId,
          criadoEm: produto.createdAt,
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
        ))
        .groupBy(produto.id, produto.sku, produto.preco, produto.brandId, produto.createdAt)
        .having(sql`max(${estoqueCanalSaldo.saldo}) > 0`)
    );

    const alertas: string[] = [];

    for (const prod of candidatos) {
      // A venda passou a ser lida do pedido: o livro-razão de movimentos, que
      // era um reflexo dele, deixou de existir com o saldo local.
      const ultimaVenda = await step.run(`ultima-venda-${prod.id}`, () =>
        db
          .select({ criado: pedido.createdAt })
          .from(pedidoItem)
          .innerJoin(pedido, eq(pedido.id, pedidoItem.pedidoId))
          .where(and(
            eq(pedido.orgId, orgId),
            eq(pedidoItem.produtoId, prod.id),
            notInArray(pedido.status, ["cancelado", "devolvido"]),
          ))
          .orderBy(sql`${pedido.createdAt} desc`)
          .limit(1)
          .then((r) => r[0]?.criado ?? null)
      );

      // Quem nunca vendeu conta o tempo desde o cadastro, não um valor fixo
      // acima do limite: senão todo produto recém-importado nasce encalhado,
      // e o alerta vira ruído no dia seguinte a uma importação de catálogo.
      const referencia = ultimaVenda ?? prod.criadoEm;
      const diasSemVenda = Math.floor((Date.now() - new Date(referencia).getTime()) / 86400000);

      if (diasSemVenda < DIAS_SEM_VENDA) continue;

      const score = calcularScoreProduto({
        diasSemVenda,
        giroMensalMedio: 0,
        saldoAtual: Number(prod.saldo),
        precoUnitario: parseFloat(prod.preco ?? "0"),
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
