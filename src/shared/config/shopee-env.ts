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

/** Há dois apps Shopee, categorias diferentes no Open Platform: "catalogo"
 *  (app "Elisa Lima CRM", Product Management — catálogo/estoque/avaliações)
 *  e "pedidos" (app "Elisa Lima Pedidos", Order Management). Cada um tem seu
 *  próprio par partner_id/partner_key, não intercambiável — a Shopee valida
 *  a assinatura HMAC contra o partner_key do app dono do partner_id usado.
 *  Guardamos os dois pares (test e live) lado a lado no .env pra trocar de
 *  ambiente só mudando SHOPEE_ENV, sem reescrever credencial nenhuma. */
export function obterShopeeAppCredenciais(
  app: "catalogo" | "pedidos" = "catalogo",
  env = process.env.SHOPEE_ENV,
): { partnerId?: string; partnerKey?: string } {
  const sufixo = shopeeAppEnvSuffix(env);
  const infixo = app === "pedidos" ? "PEDIDOS_" : "";
  return {
    partnerId: process.env[`SHOPEE_PARTNER_ID_${infixo}${sufixo}`],
    partnerKey: process.env[`SHOPEE_PARTNER_KEY_${infixo}${sufixo}`],
  };
}
