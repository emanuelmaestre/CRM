import { inngest } from "@/shared/lib/inngest/client";
import { consultarConsumoIA } from "@/modules/ai/application/ai.service";
import { emitirEvento } from "@/shared/events";

export const A21_guardaConsumoIA = inngest.createFunction(
  {
    id: "A21-guarda-consumo-ia",
    name: "A21 — Monitoramento de consumo de IA (alerta 70%/90% e corte suave)",
    concurrency: { limit: 1 },
    triggers: [{ cron: "0 */6 * * *" }],
  },
  async ({ step }) => {
    const orgId = process.env.DEFAULT_ORG_ID ?? "";

    const consumo = await step.run("consultar-consumo", () =>
      consultarConsumoIA(orgId)
    );

    if (consumo.alerta) {
      await step.run("emitir-alerta-consumo", () =>
        emitirEvento({
          tipo: "ia.limite_consumo_atingido",
          orgId,
          entidade: "llm_run",
          entidadeId: orgId,
          payload: {
            consumoAtualUsd: consumo.consumoAtualUsd,
            orcamentoUsd: consumo.orcamentoUsd,
            percentual: consumo.percentual,
            alerta: consumo.alerta,
          },
        })
      );
    }

    return {
      orgId,
      consumoAtualUsd: consumo.consumoAtualUsd,
      percentual: consumo.percentual,
      alerta: consumo.alerta,
    };
  }
);
