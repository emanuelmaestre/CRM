import { inngest } from "@/shared/lib/inngest/client";
import { db } from "@/shared/lib/db";
import { tarefa } from "@/shared/lib/db/schema/vendas";
import { cliente } from "@/shared/lib/db/schema/clientes";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { emitirEvento } from "@/shared/events";
import { startOfDay, endOfDay, addDays } from "date-fns";

export const A19_notificacoesInternas = inngest.createFunction(
  {
    id: "A19-notificacoes-internas",
    name: "A19 — Notificações internas (tarefas vencendo + aniversariantes)",
    concurrency: { limit: 1 },
    triggers: [{ cron: "0 8 * * *" }],
  },
  async ({ step }) => {
    const orgId = process.env.DEFAULT_ORG_ID ?? "";
    const hoje = new Date();
    const inicioDia = startOfDay(hoje);
    const fimDia = endOfDay(hoje);
    const amanha = endOfDay(addDays(hoje, 1));

    // Tarefas vencendo hoje ou amanhã com status pendente
    const tarefasVencendo = await step.run("tarefas-vencendo", () =>
      db
        .select({ id: tarefa.id, titulo: tarefa.titulo, vencimentoEm: tarefa.vencimentoEm, responsavelId: tarefa.responsavelId, clienteId: tarefa.clienteId })
        .from(tarefa)
        .where(and(
          eq(tarefa.orgId, orgId),
          eq(tarefa.status, "pendente"),
          gte(tarefa.vencimentoEm, inicioDia),
          lt(tarefa.vencimentoEm, amanha),
        ))
    );

    // Aniversariantes do dia (mês e dia iguais, independente do ano)
    const mesHoje = String(hoje.getMonth() + 1).padStart(2, "0");
    const diaHoje = String(hoje.getDate()).padStart(2, "0");

    const aniversariantes = await step.run("aniversariantes", () =>
      db
        .select({ id: cliente.id, nome: cliente.nome, dataNascimento: cliente.dataNascimento })
        .from(cliente)
        .where(and(
          eq(cliente.orgId, orgId),
          sql`to_char(${cliente.dataNascimento}, 'MM-DD') = ${mesHoje + "-" + diaHoje}`,
          sql`${cliente.deletedAt} is null`,
        ))
    );

    for (const t of tarefasVencendo) {
      const venceHoje = t.vencimentoEm && new Date(t.vencimentoEm) <= fimDia;
      await step.run(`notif-tarefa-${t.id}`, () =>
        emitirEvento({
          tipo: "notificacao.interna",
          orgId,
          entidade: "tarefa",
          entidadeId: t.id,
          payload: {
            tipo: "tarefa_vencendo",
            titulo: t.titulo,
            urgente: venceHoje,
            responsavelId: t.responsavelId,
            clienteId: t.clienteId,
          },
        })
      );
    }

    for (const c of aniversariantes) {
      await step.run(`notif-aniv-${c.id}`, () =>
        emitirEvento({
          tipo: "notificacao.interna",
          orgId,
          entidade: "cliente",
          entidadeId: c.id,
          payload: {
            tipo: "aniversariante_dia",
            nome: c.nome,
            dataNascimento: c.dataNascimento,
          },
        })
      );
    }

    return {
      tarefasVencendo: tarefasVencendo.length,
      aniversariantes: aniversariantes.length,
      data: inicioDia.toISOString(),
    };
  }
);
