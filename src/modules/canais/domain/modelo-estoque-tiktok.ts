import type { EstoqueCanalRef } from "./ports";

/** Resolve exatamente um SKU do TikTok sem confundir o código editável do
 * vendedor (`seller_sku`) com a identidade estável da variação (`id`).
 *
 * Vínculos novos/importados guardam `id` em `warehouseId`; o nome genérico do
 * campo é legado do contrato comum aos canais. `seller_sku` permanece como
 * fallback para vínculos antigos ou preenchidos manualmente. */
export function selecionarSkuTikTok<T extends { id?: string; seller_sku?: string }>(
  skus: T[],
  referencia: EstoqueCanalRef,
): T {
  if (referencia.warehouseId) {
    const porId = skus.filter((sku) => sku.id === referencia.warehouseId);
    if (porId.length === 1) return porId[0];
    if (porId.length > 1) {
      throw new Error(`TikTok Shop: ID interno ${referencia.warehouseId} está duplicado no anúncio ${referencia.listingId}.`);
    }
  }

  if (referencia.skuId) {
    const porSkuVendedor = skus.filter((sku) => sku.seller_sku === referencia.skuId);
    if (porSkuVendedor.length === 1) return porSkuVendedor[0];
    if (porSkuVendedor.length > 1) {
      throw new Error(`TikTok Shop: SKU do vendedor "${referencia.skuId}" é ambíguo no anúncio ${referencia.listingId}.`);
    }
  }

  // Compatibilidade segura com anúncio legado sem variação identificada: só
  // existe uma resposta possível. Com duas ou mais, nunca soma nem adivinha.
  if (!referencia.warehouseId && !referencia.skuId && skus.length === 1) return skus[0];

  const identidade = referencia.warehouseId
    ? `ID interno ${referencia.warehouseId}`
    : referencia.skuId
      ? `SKU do vendedor "${referencia.skuId}"`
      : "nenhum identificador de SKU";
  throw new Error(`TikTok Shop: ${identidade} não encontrou uma variação inequívoca no anúncio ${referencia.listingId}.`);
}
