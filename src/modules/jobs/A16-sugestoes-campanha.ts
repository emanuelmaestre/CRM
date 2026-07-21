import { inngest } from "@/shared/lib/inngest/client";
import { gerarSugestoesCampanha } from "@/modules/ai/application/ai.service";

export const A16_sugestoesCampanha = inngest.createFunction(
  { id: "A16-sugestoes-campanha", name: "A16 — Sugestões de campanha semanais (IA)", concurrency: { limit: 1 }, triggers: [{ cron: "0 8 * * 1" }] },
  async ({ step }) => {
    const orgId = process.env.DEFAULT_ORG_ID ?? "";
    await step.run("gerar-sugestoes", () => gerarSugestoesCampanha(orgId));
    return { orgId, gerado: true };
  }
);
