import brandsConfig from "@/config/brands.json";

export type BrandSlug = keyof typeof brandsConfig;

export const BRAND_SLUGS = Object.keys(brandsConfig) as BrandSlug[];

export function isBrandSlug(value: string): value is BrandSlug {
  return Object.hasOwn(brandsConfig, value);
}

export function brandEnvSuffix(slug: string): string {
  return slug.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

export function getBrandConfig(slug: string) {
  return isBrandSlug(slug) ? brandsConfig[slug] : null;
}
