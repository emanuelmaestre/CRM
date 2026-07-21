import { eq, and } from "drizzle-orm";
import { db } from "@/shared/lib/db";
import { regua, reguaExecucao, templateMensagem } from "@/shared/lib/db/schema";
import { emitirEvento } from "@/shared/events";
import { avaliarGates, type GateInput } from "../domain/gates";
import { format } from "date-fns";

export async function dispararRegua(input: {
  orgId: string;
  reguaId: string;
  clienteId: string;
  brandId: string;
  canalOrigem: string;
  gatilhoData: Date;
}): Promise<{ status: string; motivoBloqueio?: string; gateBloqueado?: string }> {
  const reguaRow = await db
    .select()
    .from(regua)
    .where(and(eq(regua.id, input.reguaId), eq(regua.orgId, input.orgId)))
    .then((r) => r[0]);

  if (!reguaRow || reguaRow.status !== "ativa") {
    return { status: "bloqueada", motivoBloqueio: "Régua inativa ou não encontrada" };
  }

  const dataRef = format(input.gatilhoData, "yyyy-MM-dd");
  const idempotencyKey = `${input.reguaId}:${input.clienteId}:${reguaRow.gatilho}:${dataRef}`;

  const gateInput: GateInput = {
    orgId: input.orgId,
    clienteId: input.clienteId,
    brandId: input.brandId,
    finalidade: "marketing",
    canal: reguaRow.canal,
    canalOrigem: input.canalOrigem,
    idempotencyKey,
    templateId: reguaRow.templateId ?? "",
  };

  const gateResult = await avaliarGates(gateInput);

  if (!gateResult.aprovado) {
    await db.insert(reguaExecucao).values({
      orgId: input.orgId,
      reguaId: input.reguaId,
      clienteId: input.clienteId,
      idempotencyKey,
      status: "bloqueada",
      gateBloqueado: gateResult.gateBloqueado,
      motivoBloqueio: gateResult.motivo,
    });

    await emitirEvento({
      tipo: "regua.bloqueada",
      orgId: input.orgId,
      brandId: input.brandId,
      entidade: "regua_execucao",
      entidadeId: idempotencyKey,
      payload: { reguaId: input.reguaId, clienteId: input.clienteId, gate: gateResult.gateBloqueado, motivo: gateResult.motivo },
    });

    return { status: "bloqueada", motivoBloqueio: gateResult.motivo, gateBloqueado: gateResult.gateBloqueado };
  }

  const [execucao] = await db.insert(reguaExecucao).values({
    orgId: input.orgId,
    reguaId: input.reguaId,
    clienteId: input.clienteId,
    idempotencyKey,
    status: "gates_aprovados",
    agendadaEm: new Date(),
  }).returning();

  await emitirEvento({
    tipo: "regua.disparada",
    orgId: input.orgId,
    brandId: input.brandId,
    entidade: "regua_execucao",
    entidadeId: execucao.id,
    payload: { reguaId: input.reguaId, clienteId: input.clienteId, canal: reguaRow.canal },
  });

  return { status: "agendada" };
}

export async function cancelarExecucoesCliente(orgId: string, clienteId: string): Promise<void> {
  await db
    .update(reguaExecucao)
    .set({ status: "bloqueada", motivoBloqueio: "Opt-out registrado — execuções canceladas", updatedAt: new Date() })
    .where(
      and(
        eq(reguaExecucao.orgId, orgId),
        eq(reguaExecucao.clienteId, clienteId),
        eq(reguaExecucao.status, "agendada")
      )
    );
}

export async function listarExecucoes(orgId: string, opts: { reguaId?: string; status?: string } = {}) {
  const conditions = [eq(reguaExecucao.orgId, orgId)];
  if (opts.reguaId) conditions.push(eq(reguaExecucao.reguaId, opts.reguaId));
  if (opts.status) conditions.push(eq(reguaExecucao.status, opts.status as never));

  return db.select().from(reguaExecucao).where(and(...conditions));
}
