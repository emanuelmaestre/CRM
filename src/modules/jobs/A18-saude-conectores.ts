import { inngest } from "@/shared/lib/inngest/client";
import { verificarSaudeConectores } from "@/modules/canais/application/saude.service";
import { finalizarJob, iniciarJob } from "./job-monitor";

export const A18_saudeConectores = inngest.createFunction(
  { id: "A18-saude-conectores", name: "A18 — Health-check dos conectores de canal", concurrency: { limit: 1 }, triggers: [{ cron: "7 */3 * * *" }] },
  async ({ step, attempt }) => {
    const orgId = process.env.DEFAULT_ORG_ID ?? "";
    const jobId = await step.run("registrar-inicio", () => iniciarJob({ orgId, nome: "A18-saude-conectores", tentativa: attempt }));
    try {
      await step.run("verificar-saude", () => verificarSaudeConectores(orgId));
      await step.run("registrar-sucesso", () => finalizarJob(jobId));
      return { orgId, verificado: true };
    } catch (error) {
      await step.run("registrar-falha", () => finalizarJob(jobId, error));
      throw error;
    }
  }
);
