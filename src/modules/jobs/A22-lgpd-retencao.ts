import { inngest } from "@/shared/lib/inngest/client";
import { db } from "@/shared/lib/db";
import { cliente } from "@/shared/lib/db/schema/clientes";
import { consentimento } from "@/shared/lib/db/schema/clientes";
import { and, eq, lt, sql } from "drizzle-orm";
import { emitirEvento } from "@/shared/events";
import { subYears } from "date-fns";

// Política padrão: anonimizar clientes inativos há mais de 5 anos sem consentimento ativo
const ANOS_RETENCAO = 5;

export const A22_lgpdRetencao = inngest.createFunction(
  {
    id: "A22-lgpd-retencao",
    name: "A22 — Limpeza e retenção LGPD (anonimização de inativos)",
    concurrency: { limit: 1 },
    triggers: [{ cron: "0 3 1 * *" }],
  },
  async ({ step }) => {
    const orgId = process.env.DEFAULT_ORG_ID ?? "";
    const limiteRetencao = subYears(new Date(), ANOS_RETENCAO);

    // Clientes sem atividade (updatedAt antigo) e sem consentimento ativo
    const candidatos = await step.run("buscar-candidatos-anonimizacao", () =>
      db
        .select({ id: cliente.id, nome: cliente.nome })
        .from(cliente)
        .where(and(
          eq(cliente.orgId, orgId),
          lt(cliente.updatedAt, limiteRetencao),
          sql`${cliente.deletedAt} is null`,
        ))
        .limit(100)
    );

    if (candidatos.length === 0) {
      return { orgId, anonimizados: 0, cutoff: limiteRetencao.toISOString() };
    }

    // Verifica cada candidato: só anonimiza se não tiver consentimento ativo
    const anonimizados: string[] = [];

    for (const c of candidatos) {
      const temConsentimentoAtivo = await step.run(`checar-consentimento-${c.id}`, () =>
        db
          .select({ id: consentimento.id })
          .from(consentimento)
          .where(and(
            eq(consentimento.clienteId, c.id),
            eq(consentimento.orgId, orgId),
            eq(consentimento.status, "ativo"),
          ))
          .then((r) => r.length > 0)
      );

      if (temConsentimentoAtivo) continue;

      await step.run(`anonimizar-${c.id}`, async () => {
        await db
          .update(cliente)
          .set({
            nome: `[Anonimizado ${c.id.slice(0, 8)}]`,
            email: null,
            telefone: null,
            cpfCnpj: null,
            dataNascimento: null,
            updatedAt: new Date(),
          })
          .where(and(eq(cliente.id, c.id), eq(cliente.orgId, orgId)));

        anonimizados.push(c.id);
      });
    }

    if (anonimizados.length > 0) {
      await step.run("emitir-evento-retencao", () =>
        emitirEvento({
          tipo: "lgpd.anonimizacao_concluida",
          orgId,
          entidade: "org",
          entidadeId: orgId,
          payload: {
            tipo: "lgpd_anonimizacao",
            total: anonimizados.length,
            cutoff: limiteRetencao.toISOString(),
            politica: `Inativos há mais de ${ANOS_RETENCAO} anos sem consentimento ativo`,
          },
        })
      );
    }

    return { orgId, candidatos: candidatos.length, anonimizados: anonimizados.length, cutoff: limiteRetencao.toISOString() };
  }
);
