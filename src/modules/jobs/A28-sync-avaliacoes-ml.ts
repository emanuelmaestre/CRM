import { inngest } from "@/shared/lib/inngest/client";
import { sincronizarAvaliacoesMercadoLivre } from "@/modules/canais/application/avaliacoes.service";
import { finalizarJob, iniciarJob } from "./job-monitor";

export const A28_syncAvaliacoesML = inngest.createFunction(
  {
    id: "A28-sync-avaliacoes-ml",
    name: "A28 — Sincronização de notas/opiniões do Mercado Livre",
    concurrency: { limit: 1 },
    // De 20 em 20 minutos o job relia e regravava os 629 anúncios ativos das
    // três contas — ~2 min de execução, três vezes por hora, para um dado que
    // muda quando um comprador avalia. Uma vez por hora corta 2/3 da carga sem
    // mudar nada do comportamento; tornar a sincronização incremental é o
    // passo seguinte, e esse mexe no serviço.
    triggers: [{ cron: "0 * * * *" }],
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
