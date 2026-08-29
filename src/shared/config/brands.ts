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

/** As empresas que ficam marcadas quando o canal muda: todas as que operam
 *  nos canais escolhidos. O canal é a porta de entrada das listas — escolher
 *  o Mercado Livre traz o Mercado Livre inteiro, com as empresas dele acesas
 *  no filtro —, e a empresa depois serve para estreitar, desmarcando o que
 *  não interessa.
 *
 *  Sem canal nenhum, nada fica marcado: empresa sem canal não mostra dado
 *  (ver `empresaSemCanalEscolhido`), e deixar as pílulas acesas sobre um
 *  convite vazio seria dizer que há um recorte aplicado quando não há.
 *
 *  Os identificadores podem ser UUIDs ou slugs — quem chama passa o que a
 *  própria tela usa como chave da seleção.
 *
 *  Isto substituiu `ajustarMarcasSelecionadasAosCanais`, que só PODAVA a
 *  seleção (o canal nunca acendia empresa nenhuma). A poda continua aqui de
 *  graça: recalcular a partir dos canais já exclui quem não opera neles. */
export function marcasDosCanaisEscolhidos(
  canais: readonly string[],
  marcas: readonly { id: string; slug: string }[],
): string[] {
  if (canais.length === 0) return [];
  return marcas
    .filter((marca) => marcaDisponivelNosCanais(marca.slug, canais))
    .map((marca) => marca.id);
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

/* ── Empresa sem canal não mostra dado ───────────────────────────────────
 *
 *  Regra de todo filtro que tem os dois eixos (Estoque, Pedidos, Clientes,
 *  Avaliações, Métricas): empresa marcada e nenhum canal marcado significaria
 *  "a KARZI somando Mercado Livre + Shopee + TikTok", e número somado entre
 *  canais é justamente o que estas telas existem para não mostrar — cada canal
 *  mede faturamento, saldo e reputação com régua própria (ver
 *  `estoque-somente-canal`: o saldo do produto é o MAIOR entre os canais,
 *  nunca a soma).
 *
 *  Canal sozinho continua abrindo onde já abria: é um recorte legítimo (um
 *  canal, com as empresas que operam nele dentro). O que não abre é empresa
 *  sem canal. */
type Selecao = readonly string[] | ReadonlySet<string>;

function quantosEscolhidos(selecao: Selecao): number {
  return "size" in selecao ? selecao.size : selecao.length;
}

export function empresaSemCanalEscolhido(marcas: Selecao, canais: Selecao): boolean {
  return quantosEscolhidos(marcas) > 0 && quantosEscolhidos(canais) === 0;
}
