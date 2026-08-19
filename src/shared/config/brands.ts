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

/** Ordem canônica das marcas (WUWU → Armarinhos Lima → KARZI, definida pela
 *  ordem das chaves em brands.json) — usada para ordenar pílulas/cards de
 *  marca de forma consistente em todo o sistema, em vez de cada tela ordenar
 *  por contagem ou nome (o que faz a ordem mudar sozinha quando os números
 *  mudam). Slugs fora da config (raros, legado) vão pro final, na ordem em
 *  que chegaram. */
export function compararPorOrdemDeMarca<T extends { slug: string }>(a: T, b: T): number {
  const indiceA = BRAND_SLUGS.indexOf(a.slug as BrandSlug);
  const indiceB = BRAND_SLUGS.indexOf(b.slug as BrandSlug);
  return (indiceA === -1 ? BRAND_SLUGS.length : indiceA) - (indiceB === -1 ? BRAND_SLUGS.length : indiceB);
}
