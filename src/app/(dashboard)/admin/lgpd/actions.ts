"use server";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getCrudContext } from "@/shared/lib/get-crud-context";
import { listarClientes } from "@/modules/clientes/application/clientes.service";
import {
  anonimizarSolicitacaoLgpd,
  concluirExportacaoLgpd,
  criarSolicitacaoLgpd,
  listarSolicitacoesLgpd,
  rejeitarSolicitacaoLgpd,
} from "@/modules/clientes/application/lgpd.service";

const IdSchema = z.string().uuid();

export async function actionListarSolicitacoesLgpd() {
  const ctx = await getCrudContext();
  if (!(await tabelaLgpdDisponivel(ctx))) {
    return { available: false, solicitacoes: [] };
  }
  return { available: true, solicitacoes: await listarSolicitacoesLgpd(ctx) };
}

export async function actionListarClientesLgpd() {
  const result = await listarClientes(await getCrudContext(), { limit: 200 });
  return result.data.map((item) => ({
    id: String(item.id),
    nome: String(item.nome),
    email: item.email ? String(item.email) : null,
    telefone: item.telefone ? String(item.telefone) : null,
  }));
}

export async function actionCriarSolicitacaoLgpd(input: unknown) {
  const ctx = await getCrudContext();
  await exigirTabelaLgpd(ctx);
  const result = await criarSolicitacaoLgpd(ctx, input);
  revalidatePath("/admin/lgpd");
  return result;
}

export async function actionConcluirExportacaoLgpd(solicitacaoId: string) {
  const ctx = await getCrudContext();
  await exigirTabelaLgpd(ctx);
  const result = await concluirExportacaoLgpd(ctx, IdSchema.parse(solicitacaoId));
  revalidatePath("/admin/lgpd");
  return result;
}

export async function actionAnonimizarSolicitacaoLgpd(input: unknown) {
  const ctx = await getCrudContext();
  await exigirTabelaLgpd(ctx);
  const result = await anonimizarSolicitacaoLgpd(ctx, input);
  revalidatePath("/admin/lgpd");
  revalidatePath("/clientes");
  return result;
}

export async function actionRejeitarSolicitacaoLgpd(input: unknown) {
  const ctx = await getCrudContext();
  await exigirTabelaLgpd(ctx);
  const result = await rejeitarSolicitacaoLgpd(ctx, input);
  revalidatePath("/admin/lgpd");
  return result;
}

async function tabelaLgpdDisponivel(ctx: Awaited<ReturnType<typeof getCrudContext>>) {
  const result = await ctx.db.execute(sql`
    select exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = 'lgpd_solicitacao'
    ) as exists
  `);
  const rows = result as unknown as Array<{ exists: boolean }>;
  return rows[0]?.exists === true;
}

async function exigirTabelaLgpd(ctx: Awaited<ReturnType<typeof getCrudContext>>) {
  if (!(await tabelaLgpdDisponivel(ctx))) {
    throw new Error("Migration LGPD 0014 ainda nao aplicada no banco conectado.");
  }
}
