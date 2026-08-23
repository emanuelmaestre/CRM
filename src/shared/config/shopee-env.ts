const BASE_URL_LIVE = "https://partner.shopeemobile.com";
const BASE_URL_TEST = "https://partner.test-stable.shopeemobile.com";

function ehTeste(env = process.env.SHOPEE_ENV): boolean {
  return env?.trim().toLowerCase() === "test";
}

/** SHOPEE_ENV=test usa o app de sandbox (Test Partner_id/Key do painel Open
 *  Platform); qualquer outro valor (ou ausente) usa produção — mesmo default
 *  de sempre, então não configurar a variável não muda nada pra quem já
 *  estava rodando em live. */
export function obterShopeeBaseUrl(env = process.env.SHOPEE_ENV): string {
  return ehTeste(env) ? BASE_URL_TEST : BASE_URL_LIVE;
}

/** App da Shopee (partner_id/partner_key) é um só por ambiente, não por
 *  marca — diferente de shop_id/access_token, que são por marca. Guardamos
 *  os dois pares (test e live) lado a lado no .env pra trocar de ambiente
 *  só mudando SHOPEE_ENV, sem reescrever credencial nenhuma. */
export function obterShopeeAppCredenciais(env = process.env.SHOPEE_ENV): { partnerId?: string; partnerKey?: string } {
  const sufixo = ehTeste(env) ? "TEST" : "LIVE";
  return {
    partnerId: process.env[`SHOPEE_PARTNER_ID_${sufixo}`],
    partnerKey: process.env[`SHOPEE_PARTNER_KEY_${sufixo}`],
  };
}
