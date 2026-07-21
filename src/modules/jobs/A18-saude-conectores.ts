import { inngest } from "@/shared/lib/inngest/client";
import { verificarSaudeConectores } from "@/modules/canais/application/saude.service";

export const A18_saudeConectores = inngest.createFunction(
  { id: "A18-saude-conectores", name: "A18 — Health-check dos conectores de canal", concurrency: { limit: 1 }, triggers: [{ cron: "*/15 * * * *" }] },
  async ({ step }) => {
    const orgId = process.env.DEFAULT_ORG_ID ?? "";
    await step.run("verificar-saude", () => verificarSaudeConectores(orgId));
    return { orgId, verificado: true };
  }
);
