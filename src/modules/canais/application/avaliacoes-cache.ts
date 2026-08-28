import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/shared/lib/db";
import { brand, channelAccount, mlAvaliacaoAnuncio, shopeeAvaliacaoAnuncio } from "@/shared/lib/db/schema";
import { urlProdutoShopee } from "@/shared/config/shopee-env";
import settingsConfig from "@/config/settings.json";
import type { MLDistribuicaoNotas, MLOpiniao } from "@/modules/canais/infrastructure/mercadolivre.provider";

const rotulosPorSlug = new Map(settingsConfig.mercadoLivre.brands.map((b) => [b.slug, b.label]));

export interface AvaliacaoCache {
  listingId: string;
  title: string;
  permalink: string | null;
  ratingAverage: number | null;
  reviewsTotal: number | null;
  ratingLevels: MLDistribuicaoNotas | null;
  opinioes: MLOpiniao[];
  brand: string;
  brandLabel: string;
  canal: "mercadolivre" | "shopee";
}

/** Lê o cache mantido pelo cron A28 — nunca chama a API do Mercado Livre na
 *  hora, por isso responde na hora também (ver avaliacoes.service.ts).
 *
 *  Mora aqui, e não dentro da rota `/api/ml/avaliacoes`, porque a página de
 *  Avaliações passou a buscar esses itens no próprio servidor (ver
 *  avaliacoes/page.tsx) em vez de deixar o navegador pedir depois que o
 *  JavaScript carrega. A rota continua existindo para o recarregamento em
 *  segundo plano, e as duas leem exatamente a mesma coisa. */
export async function listarAvaliacoesDoCache(orgId: string): Promise<{
  items: AvaliacaoCache[];
  atualizadoEm: string | null;
}> {
  // As duas tabelas são independentes. Consultá-las em paralelo reduz pela
  // metade o caminho crítico da página em conexões frias com o banco.
  const [linhasMl, linhasShopee, contasShopee] = await Promise.all([
    db
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
      .innerJoin(brand, and(eq(brand.id, mlAvaliacaoAnuncio.brandId), eq(brand.orgId, orgId)))
      .where(eq(mlAvaliacaoAnuncio.orgId, orgId)),
    db
      .select({
        itemId: shopeeAvaliacaoAnuncio.itemId,
        brandId: shopeeAvaliacaoAnuncio.brandId,
        title: shopeeAvaliacaoAnuncio.title,
        ratingAverage: shopeeAvaliacaoAnuncio.ratingAverage,
        reviewsTotal: shopeeAvaliacaoAnuncio.reviewsTotal,
        ratingLevels: shopeeAvaliacaoAnuncio.ratingLevels,
        opinioes: shopeeAvaliacaoAnuncio.opinioes,
        atualizadoEm: shopeeAvaliacaoAnuncio.atualizadoEm,
        brandSlug: brand.slug,
      })
      .from(shopeeAvaliacaoAnuncio)
      .innerJoin(brand, and(eq(brand.id, shopeeAvaliacaoAnuncio.brandId), eq(brand.orgId, orgId)))
      .where(eq(shopeeAvaliacaoAnuncio.orgId, orgId)),
    /* Só pelo shop_id de cada marca dá pra montar o link do anúncio da
       Shopee — ver `urlProdutoShopee`. Sem ele, a lista de Avaliações
       mostrava o botão "abrir anúncio" no Mercado Livre e nada na Shopee,
       como se aquele anúncio não existisse em lugar nenhum. */
    db
      .select({ brandId: channelAccount.brandId, meta: channelAccount.meta })
      .from(channelAccount)
      .where(and(eq(channelAccount.orgId, orgId), eq(channelAccount.tipo, "shopee"))),
  ]);

  const shopIdPorMarca = new Map<string, string>();
  for (const conta of contasShopee) {
    const shopId = (conta.meta as { externalAccountId?: unknown } | null)?.externalAccountId;
    // Conta sintética (seed) não tem shop_id: fica sem link, em vez de um
    // endereço inventado que levaria a uma página inexistente.
    if (typeof shopId === "string" && shopId.trim()) shopIdPorMarca.set(conta.brandId, shopId.trim());
  }

  const itemsMl = linhasMl.map((linha) => ({
    listingId: linha.listingId,
    title: linha.title,
    permalink: linha.permalink,
    // Defensivo contra linhas gravadas antes da correção em
    // normalizarAvaliacoesItem: o ML manda rating_average 0 (não null) pra
    // anúncio sem opinião, e algumas linhas do cache guardaram esse 0 cru.
    // Reforça aqui pra não depender de recoletar tudo pra corrigir a tela.
    ratingAverage: linha.reviewsTotal ? linha.ratingAverage : null,
    reviewsTotal: linha.reviewsTotal,
    ratingLevels: linha.ratingLevels as MLDistribuicaoNotas | null,
    opinioes: linha.opinioes as MLOpiniao[],
    brand: linha.brandSlug,
    brandLabel: rotulosPorSlug.get(linha.brandSlug) ?? linha.brandSlug,
    canal: "mercadolivre" as const,
  }));

  const itemsShopee = linhasShopee.map((linha) => ({
    listingId: linha.itemId,
    title: linha.title,
    permalink: shopIdPorMarca.has(linha.brandId)
      ? urlProdutoShopee(shopIdPorMarca.get(linha.brandId)!, linha.itemId)
      : null,
    ratingAverage: linha.ratingAverage,
    reviewsTotal: linha.reviewsTotal,
    ratingLevels: linha.ratingLevels as MLDistribuicaoNotas | null,
    opinioes: linha.opinioes as MLOpiniao[],
    brand: linha.brandSlug,
    brandLabel: rotulosPorSlug.get(linha.brandSlug) ?? linha.brandSlug,
    canal: "shopee" as const,
  }));

  const items = [...itemsMl, ...itemsShopee];
  const atualizadoEm = [...linhasMl, ...linhasShopee].reduce<string | null>((maisRecente, linha) => {
    const iso = linha.atualizadoEm.toISOString();
    return maisRecente === null || iso > maisRecente ? iso : maisRecente;
  }, null);

  return { items, atualizadoEm };
}
