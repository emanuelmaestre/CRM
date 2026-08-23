import type { ChannelProvider } from "../domain/ports";
import { criarMLProvider } from "./mercadolivre.provider";
import { criarShopeeProvider } from "./shopee.provider";
import { criarTikTokShopProvider } from "./tiktokshop.provider";
import { isBrandSlug } from "@/shared/config/brands";

export type Marketplace = "mercadolivre" | "shopee" | "tiktokshop";

export function isMarketplace(value: string): value is Marketplace {
  return value === "mercadolivre" || value === "shopee" || value === "tiktokshop";
}

export async function resolverChannelProvider(
  tipo: string,
  brandSlug: string,
): Promise<ChannelProvider | null> {
  if (!isMarketplace(tipo) || !isBrandSlug(brandSlug)) return null;

  switch (tipo) {
    case "mercadolivre": return criarMLProvider(brandSlug);
    case "shopee": return await criarShopeeProvider(brandSlug);
    case "tiktokshop": return criarTikTokShopProvider(brandSlug);
  }
}
