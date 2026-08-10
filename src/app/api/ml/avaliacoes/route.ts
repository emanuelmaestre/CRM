import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { authorizeRoute } from "@/shared/lib/auth/session";
import { db } from "@/shared/lib/db";
import { brand, mlAvaliacaoAnuncio } from "@/shared/lib/db/schema";
import settingsConfig from "@/config/settings.json";
import type { MLDistribuicaoNotas, MLOpiniao } from "@/modules/canais/infrastructure/mercadolivre.provider";

const rotulosPorSlug = new Map(settingsConfig.mercadoLivre.brands.map((b) => [b.slug, b.label]));

/** Lê o cache mantido pelo cron A28 — nunca chama a API do Mercado Livre na
 *  hora, por isso responde na hora também (ver avaliacoes.service.ts). */
export async function GET(): Promise<NextResponse> {
  const auth = await authorizeRoute(["admin", "gestor"]);
  if (!auth.ok) return auth.response;

  const linhas = await db
    .select({
      listingId: mlAvaliacaoAnuncio.listingId,
      title: mlAvaliacaoAnuncio.title,
      permalink: mlAvaliacaoAnuncio.permalink,
      ratingAverage: mlAvaliacaoAnuncio.ratingAverage,
      reviewsTotal: mlAvaliacaoAnuncio.reviewsTotal,
      ratingLevels: mlAvaliacaoAnuncio.ratingLevels,
      opinioes: mlAvaliacaoAnuncio.opinioes,
      atualizadoEm: mlAvaliacaoAnuncio.atualizadoEm,
      brandSlug: brand.slug,
    })
    .from(mlAvaliacaoAnuncio)
    .innerJoin(brand, and(eq(brand.id, mlAvaliacaoAnuncio.brandId), eq(brand.orgId, auth.contexto.orgId)))
    .where(eq(mlAvaliacaoAnuncio.orgId, auth.contexto.orgId));

  const items = linhas.map((linha) => ({
    listingId: linha.listingId,
    title: linha.title,
    permalink: linha.permalink,
    ratingAverage: linha.ratingAverage,
    reviewsTotal: linha.reviewsTotal,
    ratingLevels: linha.ratingLevels as MLDistribuicaoNotas | null,
    opinioes: linha.opinioes as MLOpiniao[],
    brand: linha.brandSlug,
    brandLabel: rotulosPorSlug.get(linha.brandSlug) ?? linha.brandSlug,
  }));

  const atualizadoEm = linhas.reduce<string | null>((maisRecente, linha) => {
    const iso = linha.atualizadoEm.toISOString();
    return maisRecente === null || iso > maisRecente ? iso : maisRecente;
  }, null);

  return NextResponse.json({ items, atualizadoEm });
}
