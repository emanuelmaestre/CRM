const BASE_URL_LIVE = "https://partner.shopeemobile.com";
const BASE_URL_TEST = "https://partner.test-stable.shopeemobile.com";

function ehTeste(env = process.env.SHOPEE_ENV): boolean {
  return env?.trim().toLowerCase() === "test";
}

/** "TEST" ou "LIVE" — sufixo usado nos nomes SHOPEE_PARTNER_ID_{sufixo} e
 *  SHOPEE_PARTNER_KEY_{sufixo}, conforme SHOPEE_ENV. */
export function shopeeAppEnvSuffix(env = process.env.SHOPEE_ENV): "TEST" | "LIVE" {
  return ehTeste(env) ? "TEST" : "LIVE";
}

/** SHOPEE_ENV=test usa o app de sandbox (Test Partner_id/Key do painel Open
 *  Platform); qualquer outro valor (ou ausente) usa produção — mesmo default
 *  de sempre, então não configurar a variável não muda nada pra quem já
 *  estava rodando em live. */
export function obterShopeeBaseUrl(env = process.env.SHOPEE_ENV): string {
  return ehTeste(env) ? BASE_URL_TEST : BASE_URL_LIVE;
}

/** São três apps Shopee, categorias diferentes no Open Platform, porque a
 *  Shopee autoriza por APP e cada categoria só enxerga a sua fatia da API:
 *  "catalogo" (app "Elisa Lima CRM", Product Management — catálogo/estoque/
 *  avaliações), "pedidos" (app "Elisa Lima Pedidos", Order Management) e
 *  "anuncios" (app "Elisa Lima Anuncios", Ads Service — Product Ads, Go Live
 *  concluído em 26/08/2026). Cada um tem seu próprio par partner_id/
 *  partner_key, não intercambiável — a Shopee valida a assinatura HMAC contra
 *  o partner_key do app dono do partner_id usado. Guardamos os três pares
 *  (test e live) lado a lado no .env pra trocar de ambiente só mudando
 *  SHOPEE_ENV, sem reescrever credencial nenhuma. */
export type ShopeeApp = "catalogo" | "pedidos" | "anuncios";

/** Todos os apps, na ordem em que aparecem em Configurações. */
export const SHOPEE_APPS: readonly ShopeeApp[] = ["catalogo", "pedidos", "anuncios"];

/** Aceita só os valores conhecidos — usado onde o app chega de fora (query
 *  string do /connect, cookie de state do callback), pra não deixar um valor
 *  arbitrário virar nome de env var. */
export function ehShopeeApp(valor: string | null | undefined): valor is ShopeeApp {
  return valor === "catalogo" || valor === "pedidos" || valor === "anuncios";
}

/** Pedaço do nome da env var que separa um app do outro. O app de catálogo é
 *  o mais antigo e ficou sem infixo (SHOPEE_PARTNER_ID_LIVE) — renomear
 *  quebraria a configuração já no ar, então só os apps novos têm infixo. */
function infixoDoApp(app: ShopeeApp): string {
  if (app === "pedidos") return "PEDIDOS_";
  if (app === "anuncios") return "ANUNCIOS_";
  return "";
}

export function obterShopeeAppCredenciais(
  app: ShopeeApp = "catalogo",
  env = process.env.SHOPEE_ENV,
): { partnerId?: string; partnerKey?: string } {
  const sufixo = shopeeAppEnvSuffix(env);
  const infixo = infixoDoApp(app);
  return {
    partnerId: process.env[`SHOPEE_PARTNER_ID_${infixo}${sufixo}`],
    partnerKey: process.env[`SHOPEE_PARTNER_KEY_${infixo}${sufixo}`],
  };
}

/** Canais da tabela `canal_tokens` que guardam token OAuth da Shopee — um por
 *  app do Open Platform, porque a autorização é por APP e não por loja. A
 *  mesma loja concede acesso a cada app separadamente e cada concessão gera
 *  seu próprio access_token; por isso conectar (ou reconectar) um app não
 *  mexe em linha nenhuma dos outros. */
export const CANAIS_TOKEN_SHOPEE = ["shopee", "shopee_pedidos", "shopee_anuncios"] as const;
export type CanalTokenShopee = (typeof CANAIS_TOKEN_SHOPEE)[number];

/** App → canal em canal_tokens. O app de catálogo veio primeiro e ficou com o
 *  nome curto "shopee"; renomear invalidaria os tokens já gravados. */
export function canalTokenShopee(app: ShopeeApp): CanalTokenShopee {
  if (app === "pedidos") return "shopee_pedidos";
  if (app === "anuncios") return "shopee_anuncios";
  return "shopee";
}

/** Canal em canal_tokens → app que assina a chamada. Errar aqui não é falha
 *  silenciosa: a Shopee valida a assinatura HMAC contra o partner_key do app
 *  dono do partner_id, então usar o par errado devolve "Wrong sign". */
export function appDoCanalShopee(canal: string): ShopeeApp {
  if (canal === "shopee_pedidos") return "pedidos";
  if (canal === "shopee_anuncios") return "anuncios";
  return "catalogo";
}
