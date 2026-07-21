import { inngest } from "@/shared/lib/inngest/client";
import { db } from "@/shared/lib/db";
import { org } from "@/shared/lib/db/schema";
import { eq } from "drizzle-orm";
import { emitirEvento } from "@/shared/events";

export const A20_backupVerificacao = inngest.createFunction(
  {
    id: "A20-backup-verificacao",
    name: "A20 — Backup diário e verificação de integridade",
    concurrency: { limit: 1 },
    triggers: [{ cron: "0 4 * * *" }],
  },
  async ({ step }) => {
    const orgId = process.env.DEFAULT_ORG_ID ?? "";

    // Verifica integridade: consegue ler a org (conexão com banco OK)
    const integridadeOk = await step.run("verificar-integridade", async () => {
      try {
        const resultado = await db
          .select({ id: org.id })
          .from(org)
          .where(eq(org.id, orgId))
          .then((r) => r[0]);
        return { ok: !!resultado, timestamp: new Date().toISOString() };
      } catch (err) {
        return { ok: false, erro: String(err), timestamp: new Date().toISOString() };
      }
    });

    const tipoEvento = integridadeOk.ok ? "backup.executado" : "backup.falhou";

    await step.run("emitir-evento-backup", () =>
      emitirEvento({
        tipo: tipoEvento,
        orgId,
        entidade: "org",
        entidadeId: orgId,
        payload: {
          timestamp: integridadeOk.timestamp,
          integridade: integridadeOk.ok,
          erro: "erro" in integridadeOk ? integridadeOk.erro : null,
          // Supabase gerencia backups automáticos; este job verifica a conectividade
          // e registra na audit_log para o RUNBOOK (RPO 24h / RTO 4h)
          nota: "Backup gerenciado pelo Supabase (diário automático). Este job verifica conectividade e registra o evento.",
        },
      })
    );

    return { orgId, integridade: integridadeOk.ok, timestamp: integridadeOk.timestamp };
  }
);
