import brandsConfig from "@/config/brands.json";
import { CANAIS_VENDA, type CanalVenda } from "./canais-venda";

export type BrandSlug = keyof typeof brandsConfig;

export const BRAND_SLUGS = Object.keys(brandsConfig) as BrandSlug[];

export function isBrandSlug(value: string): value is BrandSlug {
  return Object.hasOwn(brandsConfig, value);
}

export function brandEnvSuffix(slug: string): string {
  return slug.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

/** Canais de venda que a marca realmente opera. Nem toda marca vende em todo
 *  canal — a KARZI não tem Shopee, por exemplo — e antes disso as telas
 *  montavam marcas × todos os canais, criando linha para loja que não existe
 *  e que ficava "pendente" pra sempre. Marca sem a chave cai no conjunto
 *  completo, que era o comportamento anterior. */
export function canaisDaMarca(slug: string): readonly CanalVenda[] {
  const config = getBrandConfig(slug);
  const canais = config && "canais" in config ? config.canais : null;
  if (!Array.isArray(canais)) return CANAIS_VENDA;
  return canais.filter((canal): canal is CanalVenda =>
    (CANAIS_VENDA as readonly string[]).includes(canal));
}

/** Uma marca continua disponível quando nenhum canal foi escolhido ou quando
 *  opera em ao menos um dos canais ativos. Os filtros de canal são uma união
 *  (Mercado Livre + Shopee), portanto basta uma combinação válida. */
export function marcaDisponivelNosCanais(slug: string, canais: readonly string[]): boolean {
  if (canais.length === 0) return true;
  const canaisOperados = canaisDaMarca(slug) as readonly string[];
  return canais.some((canal) => canaisOperados.includes(canal));
}

/** Regra comercial do filtro: Mercado Livre sempre traz a KARZI junto. */
export function marcaFixadaPelosCanais(slug: string, canais: readonly string[]): boolean {
  return slug === "karzi" && canais.includes("mercadolivre");
}

/** Remove seleções incompatíveis com os canais e inclui as marcas obrigatórias
 *  pela regra comercial. Os identificadores podem ser UUIDs ou slugs. */
export function ajustarMarcasSelecionadasAosCanais(
  selecionadas: readonly string[],
  canais: readonly string[],
  marcas: readonly { id: string; slug: string }[],
): string[] {
  const marcaPorId = new Map(marcas.map((marca) => [marca.id, marca]));
  const proximo = selecionadas.filter((id) => {
    const marca = marcaPorId.get(id);
    return !marca || marcaDisponivelNosCanais(marca.slug, canais);
  });

  for (const marca of marcas) {
    if (marcaFixadaPelosCanais(marca.slug, canais) && !proximo.includes(marca.id)) {
      proximo.push(marca.id);
    }
  }

  return proximo;
}

export function getBrandConfig(slug: string) {
  return isBrandSlug(slug) ? brandsConfig[slug] : null;
}

/** Ordem canônica das marcas (Armarinhos Lima → KARZI → WUWU, definida pela
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
