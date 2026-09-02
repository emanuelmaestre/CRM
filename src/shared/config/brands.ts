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

/** Ordem canônica das marcas — a que `brands.json` declara.
 *
 *  Telas que montam a fileira a partir de `BRAND_SLUGS` já saem certas; as
 *  que recebem a lista pronta do servidor saíam na ordem que a consulta
 *  produziu, e a mesma barra de escopo aparecia numa ordem em Métricas e em
 *  outra em Publicidade. Marca desconhecida vai pro fim em vez de sumir. */
export function compararMarcas(slugA: string, slugB: string): number {
  const posicao = (slug: string) => {
    const indice = (BRAND_SLUGS as readonly string[]).indexOf(slug);
    return indice === -1 ? Number.MAX_SAFE_INTEGER : indice;
  };
  return posicao(slugA) - posicao(slugB);
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

/* ── Sem empresa E canal, a tela não chama informação ────────────────────
 *
 *  Regra de todo filtro que tem os dois eixos (Vendas, Estoque, Clientes,
 *  Avaliações, Métricas): a consulta só sai quando há **pelo menos uma
 *  empresa e pelo menos um canal** escolhidos — e, nas telas que têm data,
 *  também o período. Faltando qualquer um dos lados, a tela mostra o convite
 *  e não vai ao banco.
 *
 *  Antes daqui a regra era mais frouxa: canal sozinho abria a tela, porque se
 *  entendia que "Mercado Livre" já era um recorte legítimo com as empresas
 *  dele dentro. Na prática isso obrigava o canal a acender as empresas
 *  sozinho para a tela dizer o que estava somando — e era esse acendimento
 *  automático que tirava da pessoa o controle do próprio filtro: clicar em um
 *  canal marcava três empresas de uma vez, e desmarcar uma delas virava
 *  trabalho de desfazer o que ninguém pediu.
 *
 *  Exigir os dois lados resolve os dois problemas juntos. O recorte passa a
 *  ser sempre explícito — a pessoa diz qual empresa e qual canal —, e por
 *  isso nenhuma pílula precisa mais se acender por conta própria: cada clique
 *  liga ou desliga só a pílula clicada.
 *
 *  Continua valendo o motivo original de nunca abrir com um dos lados vazio:
 *  "a KARZI somando Mercado Livre + Shopee + TikTok" é justamente o número
 *  que estas telas existem para não mostrar, porque cada canal mede
 *  faturamento, saldo e reputação com régua própria (ver
 *  `estoque-somente-canal`: o saldo do produto é o MAIOR entre os canais,
 *  nunca a soma). */
type Selecao = readonly string[] | ReadonlySet<string>;

function quantosEscolhidos(selecao: Selecao): number {
  return "size" in selecao ? selecao.size : selecao.length;
}

/** O que ainda falta para a tela poder consultar — `null` quando o escopo
 *  está completo. As telas usam isto para escolher a frase do convite: pedir
 *  só a empresa a quem já escolheu o canal é mais útil do que repetir o
 *  pedido inteiro. */
export function oQueFaltaNoEscopo(
  marcas: Selecao,
  canais: Selecao,
): "empresa" | "canal" | "ambos" | null {
  const temMarca = quantosEscolhidos(marcas) > 0;
  const temCanal = quantosEscolhidos(canais) > 0;
  if (temMarca && temCanal) return null;
  if (temMarca) return "canal";
  if (temCanal) return "empresa";
  return "ambos";
}

export function escopoIncompleto(marcas: Selecao, canais: Selecao): boolean {
  return oQueFaltaNoEscopo(marcas, canais) !== null;
}

/** A frase do convite, em um lugar só. Seis telas mostram este mesmo estado
 *  vazio; com a frase escrita em cada uma delas, "canal" virava "loja" numa e
 *  "empresa" virava "marca" noutra conforme quem mexeu por último — e o
 *  vocabulário das pílulas é justamente o que a pessoa precisa reconhecer
 *  para saber onde clicar.
 *
 *  O texto nomeia o que falta em vez de repetir a regra: quem já escolheu o
 *  Mercado Livre não precisa ouvir de novo que canal é obrigatório. */
export function conviteDeEscopo(falta: "empresa" | "canal" | "ambos"): {
  titulo: string;
  descricao: string;
} {
  if (falta === "empresa") {
    return {
      titulo: "Escolha uma empresa",
      descricao: "O canal já está selecionado. Falta dizer de qual empresa você quer ver os números.",
    };
  }
  if (falta === "canal") {
    return {
      titulo: "Escolha um canal",
      descricao: "A empresa já está selecionada. Cada canal mede com régua própria, então é preciso dizer qual.",
    };
  }
  return {
    titulo: "Escolha uma empresa e um canal",
    descricao: "Os números só aparecem com os dois lados definidos — uma empresa, um canal e o período.",
  };
}
