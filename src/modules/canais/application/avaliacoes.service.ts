import { and, eq, notInArray } from "drizzle-orm";
import { db } from "@/shared/lib/db";
import { brand, channelAccount, mlAvaliacaoAnuncio } from "@/shared/lib/db/schema";
import { criarMLProvider } from "@/modules/canais/infrastructure/mercadolivre.provider";
import { isBrandSlug } from "@/shared/config/brands";

/** Espelha o loop de paginação que a tela de Avaliações fazia no navegador
 *  (ver inbox-avaliacoes.tsx) — só que rodando no servidor, uma vez por
 *  conta, com o resultado salvo em `ml_avaliacao_anuncio` em vez de
 *  devolvido pra tela. Quem lê a tabela nunca espera a API do ML. */
export async function sincronizarAvaliacoesMercadoLivre(orgId: string): Promise<{
  contasVerificadas: number;
  anunciosSincronizados: number;
}> {
  const contas = await db
    .select({
      channelAccountId: channelAccount.id,
      brandId: channelAccount.brandId,
      brandSlug: brand.slug,
    })
    .from(channelAccount)
    .innerJoin(brand, and(eq(brand.id, channelAccount.brandId), eq(brand.orgId, channelAccount.orgId)))
    .where(and(
      eq(channelAccount.orgId, orgId),
      eq(channelAccount.tipo, "mercadolivre"),
      eq(channelAccount.status, "conectado"),
    ));

  let anunciosSincronizados = 0;

  for (const conta of contas) {
    if (!isBrandSlug(conta.brandSlug)) continue;
    try {
      const provider = await criarMLProvider(conta.brandSlug);
      const anuncios = new Map<string, Awaited<ReturnType<typeof provider.listarAnunciosAtivos>>["items"][number]>();
      let offset = 0;
      let total = 1;
      while (offset < total) {
        const pagina = await provider.listarAnunciosAtivos({ offset, limit: 50 });
        for (const item of pagina.items) if (!anuncios.has(item.listingId)) anuncios.set(item.listingId, item);
        total = pagina.totalListings;
        offset += pagina.limit;
        if (pagina.items.length === 0) break;
      }

      const listingIdsAtivos = [...anuncios.keys()];
      for (const item of anuncios.values()) {
        await db.insert(mlAvaliacaoAnuncio).values({
          orgId,
          brandId: conta.brandId,
          channelAccountId: conta.channelAccountId,
          listingId: item.listingId,
          title: item.title,
          permalink: item.permalink,
          ratingAverage: item.ratingAverage,
          reviewsTotal: item.reviewsTotal,
          ratingLevels: item.ratingLevels,
          opinioes: item.opinioes,
          atualizadoEm: new Date(),
        }).onConflictDoUpdate({
          target: [mlAvaliacaoAnuncio.orgId, mlAvaliacaoAnuncio.listingId],
          set: {
            brandId: conta.brandId,
            channelAccountId: conta.channelAccountId,
            title: item.title,
            permalink: item.permalink,
            ratingAverage: item.ratingAverage,
            reviewsTotal: item.reviewsTotal,
            ratingLevels: item.ratingLevels,
            opinioes: item.opinioes,
            atualizadoEm: new Date(),
          },
        });
        anunciosSincronizados += 1;
      }

      // Anúncio pausado/removido no ML some da lista ativa — tira do cache
      // pra não mostrar nota de algo que não está mais à venda.
      if (listingIdsAtivos.length > 0) {
        await db.delete(mlAvaliacaoAnuncio).where(and(
          eq(mlAvaliacaoAnuncio.orgId, orgId),
          eq(mlAvaliacaoAnuncio.brandId, conta.brandId),
          notInArray(mlAvaliacaoAnuncio.listingId, listingIdsAtivos),
        ));
      }
    } catch (error) {
      console.error(`[avaliacoes] sincronização falhou para ${conta.brandSlug}`, error);
    }
  }

  return { contasVerificadas: contas.length, anunciosSincronizados };
}
