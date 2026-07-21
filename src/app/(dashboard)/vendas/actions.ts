"use server";

import { revalidatePath } from "next/cache";
import { getCrudContext } from "@/shared/lib/get-crud-context";
import { db } from "@/shared/lib/db";
import { funilEtapa, oportunidade } from "@/shared/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";

const DEFAULT_ORG_ID = process.env.DEFAULT_ORG_ID!;

export async function actionListarFunil() {
  const etapas = await db
    .select()
    .from(funilEtapa)
    .where(eq(funilEtapa.orgId, DEFAULT_ORG_ID))
    .orderBy(asc(funilEtapa.ordem));

  const ops = await db
    .select()
    .from(oportunidade)
    .where(and(eq(oportunidade.orgId, DEFAULT_ORG_ID)));

  return { etapas, oportunidades: ops };
}

export async function actionCriarOportunidade(formData: FormData) {
  const ctx = await getCrudContext();
  const titulo = formData.get("titulo") as string;
  const etapaId = formData.get("etapaId") as string;
  const brandId = formData.get("brandId") as string;
  const valor = formData.get("valor") as string;

  const [nova] = await db
    .insert(oportunidade)
    .values({
      orgId: ctx.orgId,
      brandId,
      etapaId,
      titulo,
      valor: valor || null,
    })
    .returning();

  revalidatePath("/vendas");
  return nova;
}

export async function actionMoverOportunidade(oportunidadeId: string, novaEtapaId: string) {
  const ctx = await getCrudContext();
  await db
    .update(oportunidade)
    .set({ etapaId: novaEtapaId, updatedAt: new Date() })
    .where(and(eq(oportunidade.id, oportunidadeId), eq(oportunidade.orgId, ctx.orgId)));
  revalidatePath("/vendas");
}
