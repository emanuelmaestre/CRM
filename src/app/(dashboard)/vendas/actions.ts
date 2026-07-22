"use server";

import { revalidatePath } from "next/cache";
import { getCrudContext } from "@/shared/lib/get-crud-context";
import { db } from "@/shared/lib/db";
import { funilEtapa, oportunidade } from "@/shared/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { assertPerfil } from "@/shared/lib/crud-factory";
import { z } from "zod";

const OportunidadeSchema = z.object({
  titulo: z.string().trim().min(2).max(160),
  etapaId: z.string().uuid(),
  brandId: z.string().uuid(),
  valor: z.string().trim().regex(/^\d+(?:[.,]\d{1,2})?$/).optional().or(z.literal("")),
});

const MoverOportunidadeSchema = z.object({
  oportunidadeId: z.string().uuid(),
  novaEtapaId: z.string().uuid(),
});

export async function actionListarFunil() {
  const ctx = await getCrudContext();
  assertPerfil(ctx, ["admin", "gestor", "vendedor"]);

  const etapas = await db
    .select()
    .from(funilEtapa)
    .where(eq(funilEtapa.orgId, ctx.orgId))
    .orderBy(asc(funilEtapa.ordem));

  const ops = await db
    .select()
    .from(oportunidade)
    .where(and(eq(oportunidade.orgId, ctx.orgId)));

  return { etapas, oportunidades: ops };
}

export async function actionCriarOportunidade(formData: FormData) {
  const ctx = await getCrudContext();
  assertPerfil(ctx, ["admin", "gestor", "vendedor"]);
  const { titulo, etapaId, brandId, valor } = OportunidadeSchema.parse({
    titulo: formData.get("titulo"),
    etapaId: formData.get("etapaId"),
    brandId: formData.get("brandId"),
    valor: formData.get("valor") ?? "",
  });

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
  assertPerfil(ctx, ["admin", "gestor", "vendedor"]);
  const ids = MoverOportunidadeSchema.parse({ oportunidadeId, novaEtapaId });
  await db
    .update(oportunidade)
    .set({ etapaId: ids.novaEtapaId, updatedAt: new Date() })
    .where(and(eq(oportunidade.id, ids.oportunidadeId), eq(oportunidade.orgId, ctx.orgId)));
  revalidatePath("/vendas");
}
