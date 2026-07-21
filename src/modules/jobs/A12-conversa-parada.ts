import { inngest } from "@/shared/lib/inngest/client";
import { db } from "@/shared/lib/db";
import { conversa, mensagem } from "@/shared/lib/db/schema";
import { and, eq, lt, sql } from "drizzle-orm";
import { emitirEvento } from "@/shared/events";

const HORAS_SEM_RESPOSTA = 24;

export const A12_conversaParada = inngest.createFunction(
  {
    id: "A12-conversa-parada",
    name: "A12 — Aviso interno de conversa sem resposta da equipe",
    concurrency: { limit: 1 },
    triggers: [{ cron: "0 * * * *" }],
  },
  async ({ step }) => {
    const orgId = process.env.DEFAULT_ORG_ID ?? "";
    const limiteData = new Date(Date.now() - HORAS_SEM_RESPOSTA * 60 * 60 * 1000);

    // Conversas ativas que não foram atualizadas nas últimas N horas
    const conversasParadas = await step.run("buscar-conversas-paradas", () =>
      db
        .select({ id: conversa.id, brandId: conversa.brandId, responsavelId: conversa.responsavelId, updatedAt: conversa.updatedAt })
        .from(conversa)
        .where(and(
          eq(conversa.orgId, orgId),
          sql`${conversa.status} in ('nova', 'em_atendimento')`,
          lt(conversa.updatedAt, limiteData),
        ))
    );

    const alertas: string[] = [];

    for (const conv of conversasParadas) {
      // Confirma que a última mensagem é de entrada (cliente esperando)
      const ultimaMensagem = await step.run(`ultima-msg-${conv.id}`, () =>
        db
          .select({ direcao: mensagem.direcao })
          .from(mensagem)
          .where(eq(mensagem.conversaId, conv.id))
          .orderBy(sql`${mensagem.createdAt} desc`)
          .limit(1)
          .then((r) => r[0] ?? null)
      );

      if (!ultimaMensagem || ultimaMensagem.direcao !== "entrada") continue;

      alertas.push(conv.id);

      await step.run(`evento-parada-${conv.id}`, () =>
        emitirEvento({
          tipo: "conversa.sem_resposta_24h",
          orgId,
          brandId: conv.brandId,
          entidade: "conversa",
          entidadeId: conv.id,
          payload: {
            responsavelId: conv.responsavelId,
            horasSemResposta: HORAS_SEM_RESPOSTA,
            ultimaAtualizacao: conv.updatedAt?.toISOString(),
          },
        })
      );
    }

    return { verificadas: conversasParadas.length, alertas: alertas.length, cutoff: limiteData.toISOString() };
  }
);
