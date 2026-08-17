export const APP_URL_PRODUCAO = "https://elisa-lima.vercel.app";

/**
 * URL canônica da aplicação. Remove a barra final para que callbacks e links
 * nunca sejam montados com `//`, mesmo quando a variável vier assim da Vercel.
 */
export function obterAppUrl(envUrl = process.env.NEXT_PUBLIC_APP_URL): string {
  return (envUrl?.trim() || APP_URL_PRODUCAO).replace(/\/+$/, "");
}

export function obterUrlCallbackMercadoLivre(envUrl = process.env.NEXT_PUBLIC_APP_URL): string {
  return `${obterAppUrl(envUrl)}/api/ml/callback`;
}
