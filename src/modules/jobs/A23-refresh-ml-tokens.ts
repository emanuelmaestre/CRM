import { inngest } from "@/shared/lib/inngest/client";
import {
  listarTokensMercadoLivreParaRenovacao,
  ML_TOKEN_REFRESH_CRON,
  renovarTokenMercadoLivre,
} from "@/modules/canais/application/mercadolivre-token.service";
import { finalizarJob, iniciarJob } from "./job-monitor";

export const A23_refreshMLTokens = inngest.createFunction(
  {
    id: "A23-refresh-ml-tokens",
    name: "A23 — Renovar tokens OAuth do Mercado Livre",
    concurrency: { limit: 1 },
    triggers: [{ cron: ML_TOKEN_REFRESH_CRON }],
  },
  async ({ step, logger, attempt }) => {
    const orgId = process.env.DEFAULT_ORG_ID ?? "";
    const jobId = await step.run("registrar-inicio", () => iniciarJob({
      orgId,
      nome: "A23-refresh-ml-tokens",
      tentativa: attempt,
    }));

    try {
      const rows = await step.run("buscar-tokens-proximos", () =>
        listarTokensMercadoLivreParaRenovacao({ orgId }),
      );
      const renovados = [];
      for (const row of rows) {
        renovados.push(await step.run(`renovar-token-${row.id}`, () => renovarTokenMercadoLivre(row)));
      }

      await step.run("registrar-sucesso", () => finalizarJob(jobId));
      logger.info(`Tokens ML renovados: ${renovados.length}`);
      return { renovados: renovados.length };
    } catch (error) {
      await step.run("registrar-falha", () => finalizarJob(jobId, error));
      throw error;
    }
  },
);
