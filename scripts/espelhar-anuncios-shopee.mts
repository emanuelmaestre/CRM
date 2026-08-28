/* Preenche de uma vez o espelho do anúncio na Shopee (status, preço, foto e
 * link) em `produto_canal`, para as linhas que ainda estão sem ele.
 *
 * Por que existe: a A5 passou a coletar esses campos, mas só reconsulta a
 * cada 6h e roda no Inngest. Sem uma primeira carga, Estoque e Avaliações
 * ficariam com os mesmos campos vazios até a próxima execução do job —
 * exatamente o buraco que a mudança veio fechar.
 *
 * Uso (PowerShell):
 *   node --env-file=.env --env-file=.env.local --import tsx scripts/espelhar-anuncios-shopee.mts
 *
 * É idempotente: reexecutar só regrava os mesmos valores.
 */
import { and, eq, inArray } from "drizzle-orm";

// Import por namespace e não nomeado, mesma razão de coletar-estoque.mts: o
// schema reexporta com `export *`, que o carregador ESM do Node não analisa
// estaticamente, e o import nomeado falha.
const { db } = await import("@/shared/lib/db");
const { brand, channelAccount, produtoCanal } = await import("@/shared/lib/db/schema");
const { criarShopeeProvider } = await import("@/modules/canais/infrastructure/shopee.provider");
const { isBrandSlug } = await import("@/shared/config/brands");

const orgId = process.env.DEFAULT_ORG_ID ?? "";
if (!orgId) throw new Error("DEFAULT_ORG_ID não definido no ambiente.");

const vinculos = await db
  .select({
    id: produtoCanal.id,
    listingId: produtoCanal.externalListingId,
    brandSlug: brand.slug,
  })
  .from(produtoCanal)
  .innerJoin(channelAccount, eq(channelAccount.id, produtoCanal.channelAccountId))
  .innerJoin(brand, eq(brand.id, channelAccount.brandId))
  .where(and(
    eq(produtoCanal.orgId, orgId),
    eq(produtoCanal.ativo, true),
    eq(channelAccount.tipo, "shopee"),
    eq(channelAccount.status, "conectado"),
  ));

const porMarca = new Map<string, typeof vinculos>();
for (const vinculo of vinculos) {
  if (!isBrandSlug(vinculo.brandSlug)) continue;
  porMarca.set(vinculo.brandSlug, [...(porMarca.get(vinculo.brandSlug) ?? []), vinculo]);
}

let espelhados = 0;
let semResposta = 0;
for (const [marcaSlug, itens] of porMarca) {
  const provider = await criarShopeeProvider(marcaSlug as Parameters<typeof criarShopeeProvider>[0]);
  const detalhes = await provider.consultarStatusAnuncios(itens.map((item) => item.listingId));
  const verificadoEm = new Date();

  // Agrupa por resposta idêntica não compensa (o link muda por item), mas as
  // gravações podem ir em paralelo — são poucas centenas.
  await Promise.all(itens.map(async (item) => {
    const detalhe = detalhes[item.listingId];
    if (!detalhe) { semResposta += 1; return; }
    await db.update(produtoCanal)
      .set({
        statusAnuncio: detalhe.status,
        statusVerificadoEm: verificadoEm,
        precoAnuncio: detalhe.preco,
        imagemUrl: detalhe.imagem,
        permalink: detalhe.permalink,
        updatedAt: verificadoEm,
      })
      .where(inArray(produtoCanal.id, [item.id]));
    espelhados += 1;
  }));

  console.log(`${marcaSlug}: ${itens.length} vínculo(s), ${Object.keys(detalhes).length} respondido(s) pela Shopee`);
}

console.log(`\nespelhados: ${espelhados} · sem resposta da Shopee: ${semResposta}`);
process.exit(0);
