// Script de leitura pura — não grava nada, não altera nenhuma campanha/anúncio.
// Busca campanhas e anúncios (itens) reais de Product Ads e imprime o JSON
// bruto que a API devolve para um anúncio, sem passar por normalizarAnuncio()
// (que só lê os campos já mapeados em mercadolivre-ads.provider.ts) — para
// confirmar se existe algum campo de data de criação do anúncio (item),
// já que o endpoint de campanhas tem `date_created` mas o de itens não tem
// isso mapeado ainda. Mesma disciplina do resto do módulo: testar contra a
// conta real antes de prometer uma coluna na tela.
//
// Uso:
//   node scripts/inspecionar-anuncio-ml.mjs karzi
//   node scripts/inspecionar-anuncio-ml.mjs wuwu
//   node scripts/inspecionar-anuncio-ml.mjs armarinhos_lima

import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");
loadEnvConfig(process.cwd());

const marcaSlug = process.argv[2];
if (!marcaSlug) {
  console.error("Uso: node scripts/inspecionar-anuncio-ml.mjs <karzi|wuwu|armarinhos_lima>");
  process.exit(1);
}

const upper = marcaSlug.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
const orgId = process.env.DEFAULT_ORG_ID;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!orgId || !supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Faltam DEFAULT_ORG_ID / NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env.local — " +
    "são eles que dão acesso ao token real em canal_tokens.",
  );
}

async function obterAccessToken() {
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const marca = await supabase
    .from("brand").select("id").eq("org_id", orgId).eq("slug", marcaSlug).eq("active", true).maybeSingle();
  if (!marca.data?.id) throw new Error(`Marca "${marcaSlug}" não encontrada ou inativa nesta org.`);

  const tokenRow = await supabase
    .from("canal_tokens")
    .select("access_token, expires_at")
    .eq("org_id", orgId).eq("brand_id", marca.data.id).eq("canal", "mercadolivre")
    .maybeSingle();

  const expirado = tokenRow.data?.expires_at
    ? new Date(tokenRow.data.expires_at).getTime() <= Date.now() + 60_000
    : true;

  if (tokenRow.data?.access_token && !expirado) {
    console.log(`[token] usando o token real de canal_tokens (expira em ${tokenRow.data.expires_at}).`);
    return tokenRow.data.access_token;
  }

  const fallback = process.env[`ML_ACCESS_TOKEN_${upper}`];
  if (fallback && !fallback.startsWith("your-")) {
    console.log(`[token] canal_tokens sem token válido — usando ML_ACCESS_TOKEN_${upper} do .env.local.`);
    return fallback;
  }

  throw new Error(
    `Sem token válido para ${marcaSlug}: canal_tokens está ${tokenRow.data ? "expirado" : "vazio"} ` +
    `e ML_ACCESS_TOKEN_${upper} no .env.local é só um placeholder. Reconecte em /configuracoes.`,
  );
}

function paraDataML(data) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}

async function main() {
  const accessToken = await obterAccessToken();
  const baseUrl = "https://api.mercadolibre.com";
  const headers = { Authorization: `Bearer ${accessToken}`, "Api-Version": "2" };

  const advertiserData = await fetch(`${baseUrl}/advertising/advertisers?product_id=PADS`, { headers })
    .then((r) => r.json());
  const advertiser = advertiserData.advertisers?.[0];
  if (!advertiser) {
    console.log("Sem advertiser PADS para esta conta:", JSON.stringify(advertiserData, null, 2));
    return;
  }
  console.log(`[advertiser] id=${advertiser.advertiser_id} site=${advertiser.site_id}`);

  const dataFim = new Date();
  const dataInicio = new Date(Date.now() - 30 * 86_400_000);
  const params = new URLSearchParams({
    date_from: paraDataML(dataInicio),
    date_to: paraDataML(dataFim),
    metrics: "clicks,prints,cost",
    limit: "5",
    offset: "0",
  });

  const anunciosUrl = `${baseUrl}/marketplace/advertising/${advertiser.site_id}/advertisers/${advertiser.advertiser_id}/product_ads/ads/search?${params}`;
  const anunciosData = await fetch(anunciosUrl, { headers }).then((r) => r.json());

  const primeiro = anunciosData.results?.[0];
  if (!primeiro) {
    console.log("Nenhum anúncio encontrado nos últimos 30 dias:", JSON.stringify(anunciosData, null, 2));
    return;
  }

  console.log("\n=== Anúncio bruto (product_ads/ads/search) — TODAS as chaves devolvidas ===\n");
  console.log(JSON.stringify(primeiro, null, 2));
  console.log("\n=== Chaves presentes ===\n", Object.keys(primeiro).sort());

  const chavesData = Object.keys(primeiro).filter((k) => /date|created|time|criad/i.test(k));
  console.log("\n=== Chaves parecidas com data/criação ===\n", chavesData.length ? chavesData : "(nenhuma)");

  // Tenta também pedir o item bruto pela API core (Items), que costuma ter
  // date_created — só para saber se dá pra cruzar por item_id caso o
  // endpoint de Ads nunca venha a ter isso.
  const itemId = primeiro.item_id;
  if (itemId) {
    const itemCore = await fetch(`${baseUrl}/items/${itemId}?attributes=id,date_created,start_time`, { headers })
      .then((r) => r.json());
    console.log(`\n=== Item ${itemId} via API core (/items/{id}) ===\n`, JSON.stringify(itemCore, null, 2));
  }
}

main().catch((erro) => {
  console.error("Falhou:", erro);
  process.exit(1);
});
