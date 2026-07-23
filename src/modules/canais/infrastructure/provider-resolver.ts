import type { ChannelProvider } from "../domain/ports";
import { criarMLProvider } from "./mercadolivre.provider";
import { criarOlistProvider } from "./olist.provider";
import { criarShopeeProvider } from "./shopee.provider";
import { criarTikTokShopProvider } from "./tiktokshop.provider";

export type Marketplace = "mercadolivre" | "shopee" | "tiktokshop" | "olist";
export type BrandSlug = "karzi" | "wuwu";

export function isMarketplace(value: string): value is Marketplace {
  return value === "mercadolivre" || value === "shopee" || value === "tiktokshop" || value === "olist";
}

export function isBrandSlug(value: string): value is BrandSlug {
  return value === "karzi" || value === "wuwu";
}

export async function resolverChannelProvider(
  tipo: string,
  brandSlug: string,
): Promise<ChannelProvider | null> {
  if (!isMarketplace(tipo) || !isBrandSlug(brandSlug)) return null;

  switch (tipo) {
    case "mercadolivre": return criarMLProvider(brandSlug);
    case "shopee": return criarShopeeProvider(brandSlug);
    case "tiktokshop": return criarTikTokShopProvider(brandSlug);
    case "olist": return criarOlistProvider(brandSlug);
  }
}
