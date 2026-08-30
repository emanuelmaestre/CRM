import type { EstoqueCanalRef } from "./ports";

/** warehouseId é o ID da variação no vínculo; skuId é o SKU textual do vendedor. */
export function selecionarModelosShopee<T extends { model_id: number; model_sku?: string }>(modelos: T[], ref: EstoqueCanalRef): T[] {
  if (ref.warehouseId) {
    const achado = modelos.filter((m) => String(m.model_id) === ref.warehouseId);
    if (achado.length !== 1) throw new Error(`Shopee: variação ${ref.warehouseId} não encontrada no anúncio ${ref.listingId}.`);
    return achado;
  }
  // Compatibilidade com vínculos antigos: primeiro o SKU literal, nunca Number(SKU).
  const porSku = ref.skuId ? modelos.filter((m) => m.model_sku === ref.skuId) : [];
  if (porSku.length === 1) return porSku;
  if (modelos.length === 1 && modelos[0].model_id === 0) return modelos;
  // Um anúncio com variações não pode devolver a soma de todas para um produto.
  throw new Error(`Shopee: vínculo sem variação inequívoca para o anúncio ${ref.listingId}; conferir o mapeamento.`);
}
