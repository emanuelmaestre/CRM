import { inngest } from "@/shared/lib/inngest/client";
import { db } from "@/shared/lib/db";
import { pedido } from "@/shared/lib/db/schema";
import { and, eq, gte, count, sum } from "drizzle-orm";
import { gerarInsightFunil } from "@/modules/ai/application/ai.service";
import { subDays } from "date-fns";

export const A15_insightsFunil = inngest.createFunction(
  { id: "A15-insights-funil", name: "A15 — Insights executivos semanais (IA)", concurrency: { limit: 1 }, triggers: [{ cron: "0 7 * * 1" }] },
  async ({ step }) => {
    const orgId = process.env.DEFAULT_ORG_ID ?? "";
    const desde = subDays(new Date(), 30);

    const dadosAgregados = await step.run("agregar-dados-funil", async () => {
      const [totalPedidos] = await db
        .select({ total: count(), receita: sum(pedido.total) })
        .from(pedido)
        .where(and(eq(pedido.orgId, orgId), gte(pedido.createdAt, desde)));

      const [pedidosConcluidos] = await db
        .select({ total: count() })
        .from(pedido)
        .where(and(eq(pedido.orgId, orgId), eq(pedido.status, "concluido"), gte(pedido.createdAt, desde)));

      const [pedidosCancelados] = await db
        .select({ total: count() })
        .from(pedido)
        .where(and(eq(pedido.orgId, orgId), eq(pedido.status, "cancelado"), gte(pedido.createdAt, desde)));

      return {
        periodo: "últimos 30 dias",
        totalPedidos: totalPedidos?.total ?? 0,
        receitaTotal: totalPedidos?.receita ?? 0,
        pedidosConcluidos: pedidosConcluidos?.total ?? 0,
        pedidosCancelados: pedidosCancelados?.total ?? 0,
        taxaConversao: totalPedidos?.total
          ? `${((Number(pedidosConcluidos?.total ?? 0) / Number(totalPedidos.total)) * 100).toFixed(1)}%`
          : "0%",
      };
    });

    await step.run("gerar-insight", () => gerarInsightFunil(orgId, dadosAgregados as Record<string, unknown>));

    return { gerado: true };
  }
);
