import { and, eq, notInArray, sql } from "drizzle-orm";
import { db } from "@/shared/lib/db";
import { brand, channelAccount, mlAvaliacaoAnuncio, shopeeAvaliacaoAnuncio } from "@/shared/lib/db/schema";
import { criarMLProvider } from "@/modules/canais/infrastructure/mercadolivre.provider";
import { criarShopeeProvider } from "@/modules/canais/infrastructure/shopee.provider";
import { isBrandSlug } from "@/shared/config/brands";

async function listarContasMercadoLivreAvaliacoes(orgId: string, channelAccountId?: string) {
  const condicoes = [
    eq(channelAccount.orgId, orgId),
    eq(channelAccount.tipo, "mercadolivre"),
    eq(channelAccount.status, "conectado"),
  ];
  if (channelAccountId) condicoes.push(eq(channelAccount.id, channelAccountId));

  return db
    .select({
      channelAccountId: channelAccount.id,
      brandId: channelAccount.brandId,
      brandSlug: brand.slug,
    })
    .from(channelAccount)
    .innerJoin(brand, and(eq(brand.id, channelAccount.brandId), eq(brand.orgId, channelAccount.orgId)))
    .where(and(...condicoes));
}

/** Espelha o loop de paginação que a tela de Avaliações fazia no navegador
 *  (ver inbox-avaliacoes.tsx) — só que rodando no servidor, uma vez por
 *  conta, com o resultado salvo em `ml_avaliacao_anuncio` em vez de
 *  devolvido pra tela. Quem lê a tabela nunca espera a API do ML. */
export async function sincronizarAvaliacoesMercadoLivre(orgId: string): Promise<{
  contasVerificadas: number;
  anunciosSincronizados: number;
}> {
  return sincronizarAvaliacoesMercadoLivrePorConta(orgId);
}

export async function sincronizarAvaliacoesMercadoLivreConta(orgId: string, channelAccountId: string): Promise<{
  contasVerificadas: number;
  anunciosSincronizados: number;
}> {
  return sincronizarAvaliacoesMercadoLivrePorConta(orgId, channelAccountId);
}

async function sincronizarAvaliacoesMercadoLivrePorConta(orgId: string, channelAccountId?: string): Promise<{
  contasVerificadas: number;
  anunciosSincronizados: number;
}> {
  const contas = await listarContasMercadoLivreAvaliacoes(orgId, channelAccountId);
  let anunciosSincronizados = 0;

  for (const conta of contas) {
    if (!isBrandSlug(conta.brandSlug)) continue;
    try {
      const provider = await criarMLProvider(conta.brandSlug);
      const anuncios = new Map<string, Awaited<ReturnType<typeof provider.listarAnunciosAtivos>>["items"][number]>();
      let offset = 0;
      let total = 1;
      while (offset < total) {
        const pagina = await provider.listarAnunciosAtivos({ offset, limit: 50, comAvaliacoes: true });
        for (const item of pagina.items) if (!anuncios.has(item.listingId)) anuncios.set(item.listingId, item);
        total = pagina.totalListings;
        offset += pagina.limit;
        if (pagina.items.length === 0) break;
      }

      const listingIdsAtivos = [...anuncios.keys()];
      // Um insert em lote em vez de um await por anúncio: a auditoria de
      // performance mediu essa linha como 291 mil chamadas em 28 dias
      // (7,7% de todo o tempo de banco do sistema) — ~145 round-trips
      // sequenciais por execução do job, quando 1 resolvia. `excluded.*`
      // mantém a mesma resolução de conflito de antes, só que por linha,
      // não por valor fixo da conta (que já era o mesmo em ambos os casos).
      const linhas = [...anuncios.values()].map((item) => ({
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
      }));
      if (linhas.length > 0) {
        await db.insert(mlAvaliacaoAnuncio).values(linhas).onConflictDoUpdate({
          target: [mlAvaliacaoAnuncio.orgId, mlAvaliacaoAnuncio.listingId],
          set: {
            brandId: sql`excluded.brand_id`,
            channelAccountId: sql`excluded.channel_account_id`,
            title: sql`excluded.title`,
            permalink: sql`excluded.permalink`,
            ratingAverage: sql`excluded.rating_average`,
            reviewsTotal: sql`excluded.reviews_total`,
            ratingLevels: sql`excluded.rating_levels`,
            opinioes: sql`excluded.opinioes`,
            atualizadoEm: sql`excluded.atualizado_em`,
          },
        });
      }
      anunciosSincronizados += linhas.length;

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

async function listarContasShopeeAvaliacoes(orgId: string, channelAccountId?: string) {
  const condicoes = [
    eq(channelAccount.orgId, orgId),
    eq(channelAccount.tipo, "shopee"),
    eq(channelAccount.status, "conectado"),
  ];
  if (channelAccountId) condicoes.push(eq(channelAccount.id, channelAccountId));

  return db
    .select({
      channelAccountId: channelAccount.id,
      brandId: channelAccount.brandId,
      brandSlug: brand.slug,
    })
    .from(channelAccount)
    .innerJoin(brand, and(eq(brand.id, channelAccount.brandId), eq(brand.orgId, channelAccount.orgId)))
    .where(and(...condicoes));
}

export async function sincronizarAvaliacoesShopeeConta(orgId: string, channelAccountId: string): Promise<{
  contasVerificadas: number;
  anunciosSincronizados: number;
}> {
  const contas = await listarContasShopeeAvaliacoes(orgId, channelAccountId);
  let anunciosSincronizados = 0;
  let ultimoErro: unknown;

  for (const conta of contas) {
    if (!isBrandSlug(conta.brandSlug)) continue;
    try {
      const provider = await criarShopeeProvider(conta.brandSlug);
      const itens = await provider.listarAvaliacoes();

      const linhas = itens.map((item) => ({
        orgId,
        brandId: conta.brandId,
        channelAccountId: conta.channelAccountId,
        itemId: item.itemId,
        title: item.title,
        ratingAverage: item.ratingAverage,
        reviewsTotal: item.reviewsTotal,
        ratingLevels: item.ratingLevels,
        opinioes: item.opinioes,
        atualizadoEm: new Date(),
      }));
      if (linhas.length > 0) {
        await db.insert(shopeeAvaliacaoAnuncio).values(linhas).onConflictDoUpdate({
          target: [shopeeAvaliacaoAnuncio.orgId, shopeeAvaliacaoAnuncio.itemId],
          set: {
            brandId: sql`excluded.brand_id`,
            channelAccountId: sql`excluded.channel_account_id`,
            title: sql`excluded.title`,
            ratingAverage: sql`excluded.rating_average`,
            reviewsTotal: sql`excluded.reviews_total`,
            ratingLevels: sql`excluded.rating_levels`,
            opinioes: sql`excluded.opinioes`,
            atualizadoEm: sql`excluded.atualizado_em`,
          },
        });
      }
      anunciosSincronizados += linhas.length;

      const itemIdsAtivos = itens.map((i) => i.itemId);
      if (itemIdsAtivos.length > 0) {
        await db.delete(shopeeAvaliacaoAnuncio).where(and(
          eq(shopeeAvaliacaoAnuncio.orgId, orgId),
          eq(shopeeAvaliacaoAnuncio.brandId, conta.brandId),
          notInArray(shopeeAvaliacaoAnuncio.itemId, itemIdsAtivos),
        ));
      }
    } catch (error) {
      console.error(`[avaliacoes] sincronização Shopee falhou para ${conta.brandSlug}`, error);
      ultimoErro = error;
    }
  }

  // Deixa o erro subir (depois de tentar todas as contas) pra ferramenta de
  // Sincronização mostrar o motivo real na tela, em vez de "0 sincronizados"
  // silencioso — importa saber se falhou por permissão, IP, token, etc.
  if (ultimoErro && anunciosSincronizados === 0) throw ultimoErro;

  return { contasVerificadas: contas.length, anunciosSincronizados };
}
