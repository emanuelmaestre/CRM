import { inngest } from "@/shared/lib/inngest/client";
import { db } from "@/shared/lib/db";
import { scoreCliente, sugestaoCampanha } from "@/shared/lib/db/schema";
import { and, count, eq, gte, sum } from "drizzle-orm";
import { pedido } from "@/shared/lib/db/schema/vendas";
import { subDays } from "date-fns";
import { gerarDocumento } from "@/modules/documentos/application/documentos.service";
import type { CrudContext } from "@/shared/lib/crud-factory";

export const A17_documentosAutomaticos = inngest.createFunction(
  {
    id: "A17-documentos-automaticos",
    name: "A17 — Geração automática de documento executivo",
    triggers: [{ event: "ia/documento.solicitado" }],
  },
  async ({ event, step }) => {
    const { orgId, geradoPorId } = event.data as { orgId: string; geradoPorId?: string };

    const desde = subDays(new Date(), 30);

    const [vendasRow, riscosRow, sugestoesRow, canaisRow] = await step.run("agregar-dados", async () => {
      return Promise.all([
        db.select({ total: count(), receita: sum(pedido.total) })
          .from(pedido)
          .where(and(eq(pedido.orgId, orgId), gte(pedido.createdAt, desde)))
          .then((r) => r[0]),
        db.select({ total: count() })
          .from(scoreCliente)
          .where(and(eq(scoreCliente.orgId, orgId), gte(scoreCliente.churnRisk, 60)))
          .then((r) => r[0]),
        db.select({ total: count() })
          .from(sugestaoCampanha)
          .where(and(eq(sugestaoCampanha.orgId, orgId), eq(sugestaoCampanha.status, "sugerida")))
          .then((r) => r[0]),
        db.select({ canal: pedido.canal })
          .from(pedido)
          .where(and(eq(pedido.orgId, orgId), gte(pedido.createdAt, desde)))
          .groupBy(pedido.canal),
      ]);
    });

    const ctx: CrudContext = {
      db,
      orgId,
      userId: geradoPorId,
      perfil: "admin",
    };

    const resultado = await step.run("gerar-documento", () =>
      gerarDocumento(ctx, {
        tipo: "relatorio_executivo",
        periodo: "últimos 30 dias",
        dadosKpis: {
          receitaTotal: parseFloat(vendasRow?.receita ?? "0"),
          totalPedidos: Number(vendasRow?.total ?? 0),
          canaisAtivos: canaisRow.length,
          clientesEmRisco: Number(riscosRow?.total ?? 0),
          sugestoesPendentes: Number(sugestoesRow?.total ?? 0),
        },
      })
    );

    return { orgId, documentoId: resultado.documentoId, nomeArquivo: resultado.nomeArquivo };
  }
);
