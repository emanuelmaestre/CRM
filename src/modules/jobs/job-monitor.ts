import { eq } from "drizzle-orm";
import { db } from "@/shared/lib/db";
import { jobRun } from "@/shared/lib/db/schema";

export async function iniciarJob(input: {
  orgId: string;
  nome: string;
  tentativa: number;
  payload?: Record<string, unknown>;
}): Promise<string> {
  const [registro] = await db.insert(jobRun).values({
    orgId: input.orgId || null,
    nome: input.nome,
    tentativa: String(input.tentativa + 1),
    payload: input.payload,
    status: "rodando",
  }).returning({ id: jobRun.id });
  return registro.id;
}

export async function finalizarJob(jobId: string, erro?: unknown): Promise<void> {
  await db.update(jobRun).set({
    status: erro === undefined ? "concluido" : "falhou",
    erro: erro === undefined ? null : erro instanceof Error ? erro.message : String(erro),
    finalizadoEm: new Date(),
  }).where(eq(jobRun.id, jobId));
}
