"use server";

import { and, count, desc, eq, gte, sum } from "drizzle-orm";
import { subDays } from "date-fns";
import { db } from "@/shared/lib/db";
import { pedido } from "@/shared/lib/db/schema/vendas";
import { scoreCliente } from "@/shared/lib/db/schema/scoring";
import { getCrudContext } from "@/shared/lib/get-crud-context";
import { assertPerfil } from "@/shared/lib/crud-factory";
import { z } from "zod";
import {
  listarSugestoes, aprovarSugestao, rejeitarSugestao,
  gerarDocumentoExecutivo, listarInsights, consultarConsumoIA,
} from "@/modules/ai/application/ai.service";

const SugestaoIdSchema = z.string().uuid();
const MotivoRejeicaoSchema = z.string().trim().min(3).max(500);

function assertPodeGerirInteligencia(ctx: Awaited<ReturnType<typeof getCrudContext>>) {
  assertPerfil(ctx, ["admin", "gestor"]);
}

export async function actionRelatorioVendas() {
  const ctx = await getCrudContext();
  assertPodeGerirInteligencia(ctx);
  const desde = subDays(new Date(), 30);

  const porCanal = await db
    .select({ canal: pedido.canal, total: count(), receita: sum(pedido.total) })
    .from(pedido)
    .where(and(eq(pedido.orgId, ctx.orgId), gte(pedido.createdAt, desde)))
    .groupBy(pedido.canal)
    .orderBy(desc(sum(pedido.total)));

  const porStatus = await db
    .select({ status: pedido.status, total: count() })
    .from(pedido)
    .where(and(eq(pedido.orgId, ctx.orgId), gte(pedido.createdAt, desde)))
    .groupBy(pedido.status);

  return { porCanal, porStatus, periodo: "últimos 30 dias" };
}

export async function actionListarSugestoes() {
  const ctx = await getCrudContext();
  assertPodeGerirInteligencia(ctx);
  return listarSugestoes(ctx.orgId);
}

export async function actionListarInsights() {
  const ctx = await getCrudContext();
  assertPodeGerirInteligencia(ctx);
  return listarInsights(ctx.orgId);
}

export async function actionConsumIA() {
  const ctx = await getCrudContext();
  assertPodeGerirInteligencia(ctx);
  return consultarConsumoIA(ctx.orgId);
}

export async function actionAprovarSugestao(sugestaoId: string) {
  const ctx = await getCrudContext();
  assertPodeGerirInteligencia(ctx);
  const id = SugestaoIdSchema.parse(sugestaoId);
  if (!ctx.userId) throw new Error("Usuário não identificado.");
  await aprovarSugestao(ctx.orgId, id, ctx.userId);
}

export async function actionRejeitarSugestao(sugestaoId: string, motivo: string = "Rejeitado pelo operador") {
  const ctx = await getCrudContext();
  assertPodeGerirInteligencia(ctx);
  const id = SugestaoIdSchema.parse(sugestaoId);
  const motivoValidado = MotivoRejeicaoSchema.parse(motivo);
  await rejeitarSugestao(ctx.orgId, id, motivoValidado);
}

export async function actionGerarDocumentoExecutivo() {
  const ctx = await getCrudContext();
  assertPodeGerirInteligencia(ctx);
  const desde = subDays(new Date(), 30);

  const [vendasRow, riscosRow] = await Promise.all([
    db
      .select({ total: count(), receita: sum(pedido.total) })
      .from(pedido)
      .where(and(eq(pedido.orgId, ctx.orgId), gte(pedido.createdAt, desde)))
      .then((r) => r[0]),
    db
      .select({ total: count() })
      .from(scoreCliente)
      .where(and(eq(scoreCliente.orgId, ctx.orgId), gte(scoreCliente.churnRisk, 60)))
      .then((r) => r[0]),
  ]);

  const sugestoes = await listarSugestoes(ctx.orgId, "sugerida");

  const canaisRow = await db
    .select({ canal: pedido.canal })
    .from(pedido)
    .where(and(eq(pedido.orgId, ctx.orgId), gte(pedido.createdAt, desde)))
    .groupBy(pedido.canal);

  return gerarDocumentoExecutivo(
    ctx.orgId,
    {
      receitaTotal: parseFloat(vendasRow?.receita ?? "0"),
      totalPedidos: Number(vendasRow?.total ?? 0),
      canaisAtivos: canaisRow.length,
      clientesEmRisco: Number(riscosRow?.total ?? 0),
      sugestoesPendentes: sugestoes.length,
      periodo: "últimos 30 dias",
    },
  );
}
