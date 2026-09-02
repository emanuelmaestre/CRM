import { inngest } from "@/shared/lib/inngest/client";
import {
  listarTokensTikTokParaRenovacao,
  renovarTokenTikTok,
  TIKTOK_TOKEN_REFRESH_CRON,
} from "@/modules/canais/application/tiktok-token.service";
import { finalizarJob, iniciarJob } from "./job-monitor";

export const A36_refreshTikTokTokens = inngest.createFunction(
  {
    id: "A36-refresh-tiktok-tokens",
    name: "A36 — Renovar tokens OAuth do TikTok Shop",
    concurrency: { limit: 1 },
    triggers: [{ cron: TIKTOK_TOKEN_REFRESH_CRON }],
  },
  async ({ step, logger, attempt }) => {
    const orgId = process.env.DEFAULT_ORG_ID ?? "";
    const jobId = await step.run("registrar-inicio", () => iniciarJob({
      orgId,
      nome: "A36-refresh-tiktok-tokens",
      tentativa: attempt,
    }));

    try {
      const rows = await step.run("buscar-tokens-proximos", () =>
        listarTokensTikTokParaRenovacao({ orgId }),
      );
      // Um `step.run` por token, como no A23/A33: a renovação já concluída fica
      // memoizada e uma reexecução do Inngest não queima de novo o refresh
      // token que acabou de ser gasto.
      const renovados = [];
      for (const row of rows) {
        renovados.push(await step.run(`renovar-token-${row.id}`, () => renovarTokenTikTok(row)));
      }

      await step.run("registrar-sucesso", () => finalizarJob(jobId));
      logger.info(`Tokens TikTok renovados: ${renovados.length}`);
      return { renovados: renovados.length };
    } catch (error) {
      await step.run("registrar-falha", () => finalizarJob(jobId, error));
      throw error;
    }
  },
);
