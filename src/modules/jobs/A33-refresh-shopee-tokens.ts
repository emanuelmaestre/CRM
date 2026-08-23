import { inngest } from "@/shared/lib/inngest/client";
import {
  listarTokensShopeeParaRenovacao,
  renovarTokenShopee,
  SHOPEE_TOKEN_REFRESH_CRON,
} from "@/modules/canais/application/shopee-token.service";
import { finalizarJob, iniciarJob } from "./job-monitor";

export const A33_refreshShopeeTokens = inngest.createFunction(
  {
    id: "A33-refresh-shopee-tokens",
    name: "A33 — Renovar tokens OAuth da Shopee",
    concurrency: { limit: 1 },
    triggers: [{ cron: SHOPEE_TOKEN_REFRESH_CRON }],
  },
  async ({ step, logger, attempt }) => {
    const orgId = process.env.DEFAULT_ORG_ID ?? "";
    const jobId = await step.run("registrar-inicio", () => iniciarJob({
      orgId,
      nome: "A33-refresh-shopee-tokens",
      tentativa: attempt,
    }));

    try {
      const rows = await step.run("buscar-tokens-proximos", () =>
        listarTokensShopeeParaRenovacao({ orgId }),
      );
      const renovados = [];
      for (const row of rows) {
        renovados.push(await step.run(`renovar-token-${row.id}`, () => renovarTokenShopee(row)));
      }

      await step.run("registrar-sucesso", () => finalizarJob(jobId));
      logger.info(`Tokens Shopee renovados: ${renovados.length}`);
      return { renovados: renovados.length };
    } catch (error) {
      await step.run("registrar-falha", () => finalizarJob(jobId, error));
      throw error;
    }
  },
);
