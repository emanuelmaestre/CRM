// Diagnóstico somente leitura das notificações não entregues pelo Mercado Livre.
// Não imprime tokens, headers, compradores ou corpo integral das notificações.
// Uso: node scripts/diag-webhooks-ml.mjs wuwu

import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");
loadEnvConfig(process.cwd());

const marcaSlug = process.argv[2];
if (!marcaSlug) throw new Error("Uso: node scripts/diag-webhooks-ml.mjs <marca>");

const orgId = process.env.DEFAULT_ORG_ID;
const appId = process.env.ML_CLIENT_ID;
if (!orgId || !appId) throw new Error("DEFAULT_ORG_ID/ML_CLIENT_ID ausente.");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);
const { data: marca, error: erroMarca } = await supabase.from("brand")
  .select("id")
  .eq("org_id", orgId)
  .eq("slug", marcaSlug)
  .maybeSingle();
if (erroMarca || !marca) throw new Error(erroMarca?.message ?? "Marca não encontrada.");

const { data: tokenRow, error: erroToken } = await supabase.from("canal_tokens")
  .select("access_token")
  .eq("org_id", orgId)
  .eq("brand_id", marca.id)
  .eq("canal", "mercadolivre")
  .maybeSingle();
if (erroToken || !tokenRow?.access_token) throw new Error(erroToken?.message ?? "Token não encontrado.");

const url = new URL("https://api.mercadolibre.com/missed_feeds");
url.searchParams.set("app_id", appId);
url.searchParams.set("topic", "orders_v2");
url.searchParams.set("limit", "50");
url.searchParams.set("offset", "0");

const appResposta = await fetch(`https://api.mercadolibre.com/applications/${encodeURIComponent(appId)}`, {
  headers: { Authorization: `Bearer ${tokenRow.access_token}` },
});
const appBruto = await appResposta.json();
console.log("APLICACAO", {
  http: appResposta.status,
  id: appBruto?.id ?? null,
  active: appBruto?.active ?? null,
  siteId: appBruto?.site_id ?? null,
  scopes: appBruto?.scopes ?? null,
  redirectUris: appBruto?.redirect_uris ?? appBruto?.redirect_uri ?? null,
  notificationUrl: appBruto?.notification_url ?? appBruto?.notifications_callback_url ?? null,
  topics: appBruto?.topics ?? appBruto?.notification_topics ?? null,
  keys: Object.keys(appBruto ?? {}),
});

const resposta = await fetch(url, {
  headers: { Authorization: `Bearer ${tokenRow.access_token}` },
});
const bruto = await resposta.json();
if (!resposta.ok) {
  console.log("HTTP", resposta.status, { message: bruto?.message, error: bruto?.error });
  process.exit(1);
}

const candidatos = Array.isArray(bruto) ? bruto
  : Array.isArray(bruto?.results) ? bruto.results
  : Array.isArray(bruto?.messages) ? bruto.messages
  : Array.isArray(bruto?.feeds) ? bruto.feeds
  : [];

function caminhoSeguro(valor) {
  if (typeof valor !== "string") return null;
  try {
    const parsed = new URL(valor);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return valor.startsWith("/") ? valor : null;
  }
}

function resumir(item) {
  const request = item?.request ?? item?.feed?.request ?? {};
  const response = item?.response ?? item?.feed?.response ?? {};
  return {
    id: item?._id ?? item?.id ?? null,
    topic: item?.topic ?? item?.feed?.topic ?? null,
    resource: item?.resource ?? item?.feed?.resource ?? request?.body?.resource ?? null,
    sent: item?.sent ?? item?.feed?.sent ?? item?.date_created ?? null,
    attempts: item?.attempts ?? item?.feed?.attempts ?? null,
    callback: caminhoSeguro(request?.url ?? item?.url),
    httpCode: response?.http_code ?? response?.status ?? item?.http_code ?? null,
    erro: response?.error ?? item?.error ?? null,
  };
}

console.log("MISSED_FEEDS", {
  http: resposta.status,
  topLevelKeys: Object.keys(bruto ?? {}),
  paging: bruto?.paging ?? null,
  quantidadeRetornada: candidatos.length,
  registros: candidatos.map(resumir),
});
