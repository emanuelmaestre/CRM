import { inngest } from "@/shared/lib/inngest/client";
import { sincronizarAvaliacoesMercadoLivre } from "@/modules/canais/application/avaliacoes.service";
import { finalizarJob, iniciarJob } from "./job-monitor";

export const A28_syncAvaliacoesML = inngest.createFunction(
  {
    id: "A28-sync-avaliacoes-ml",
    name: "A28 — Sincronização de notas/opiniões do Mercado Livre",
    concurrency: { limit: 1 },
    triggers: [{ cron: "*/20 * * * *" }],
  },
  async ({ step, attempt }) => {
    const orgId = process.env.DEFAULT_ORG_ID ?? "";
    const jobId = await step.run("registrar-inicio", () => iniciarJob({ orgId, nome: "A28-sync-avaliacoes-ml", tentativa: attempt }));
    try {
      const resultado = await step.run("sincronizar-avaliacoes", () => sincronizarAvaliacoesMercadoLivre(orgId));
      await step.run("registrar-sucesso", () => finalizarJob(jobId));
      return { orgId, ...resultado };
    } catch (error) {
      await step.run("registrar-falha", () => finalizarJob(jobId, error));
      throw error;
    }
  }
);
