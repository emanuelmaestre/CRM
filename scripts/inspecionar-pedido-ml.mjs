// Script de leitura pura — não grava nada, não altera nenhum pedido.
// Busca UM pedido real recente do Mercado Livre e imprime o JSON bruto que a
// API devolve, sem passar pelo normalizarPedidoMercadoLivre() (que só lê
// buyer.id/nickname/email — este script mostra tudo que veio, para
// confirmar de verdade se nome completo, endereço etc. estão disponíveis
// ou vêm mascarados/ausentes.
//
// Uso:
//   node scripts/inspecionar-pedido-ml.mjs karzi
//   node scripts/inspecionar-pedido-ml.mjs wuwu
//   node scripts/inspecionar-pedido-ml.mjs armarinhos_lima

import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");
loadEnvConfig(process.cwd());

const marcaSlug = process.argv[2];
if (!marcaSlug) {
  console.error("Uso: node scripts/inspecionar-pedido-ml.mjs <karzi|wuwu|armarinhos_lima>");
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

// Mesma lógica de obterTokenMercadoLivre() em mercadolivre.provider.ts:
// o token de verdade vive em canal_tokens (renovado a cada hora pelo A23),
// o env var é só um fallback estático que não é renovado sozinho.
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

async function main() {
  const accessToken = await obterAccessToken();
  const baseUrl = "https://api.mercadolibre.com";
  const auth = { Authorization: `Bearer ${accessToken}` };

  const me = await fetch(`${baseUrl}/users/me`, { headers: auth }).then((r) => r.json());
  if (!me.id) throw new Error(`/users/me não retornou id: ${JSON.stringify(me)}`);
  console.log(`[seller] ${marcaSlug} → user_id ${me.id}`);

  const busca = await fetch(
    `${baseUrl}/orders/search?seller=${me.id}&order.date_created.from=${encodeURIComponent(
      new Date(Date.now() - 180 * 86_400_000).toISOString(),
    )}&limit=1&sort=date_desc`,
    { headers: auth },
  ).then((r) => r.json());

  const pedido = busca.results?.[0];
  if (!pedido) {
    console.log("Nenhum pedido encontrado nos últimos 180 dias para esta marca.");
    console.log(JSON.stringify(busca, null, 2));
    return;
  }

  console.log("\n=== Pedido bruto (/orders/search) — campo por campo relevante a cadastro ===\n");
  console.log("buyer:", JSON.stringify(pedido.buyer, null, 2));
  console.log("shipping:", JSON.stringify(pedido.shipping, null, 2));
  console.log("billing_info:", JSON.stringify(pedido.billing_info ?? "(ausente na resposta)", null, 2));

  // Se veio um shipping.id, o endereço completo normalmente exige uma chamada
  // separada — é aqui que o ML mais costuma mascarar dado de contato.
  if (pedido.shipping?.id) {
    const envio = await fetch(`${baseUrl}/shipments/${pedido.shipping.id}`, { headers: auth }).then((r) => r.json());
    console.log("\n/shipments/{id} → receiver_address:", JSON.stringify(envio.receiver_address ?? envio, null, 2));
  } else {
    console.log("\nPedido sem shipping.id — não há endpoint de envio para consultar endereço.");
  }

  console.log("\n=== Pedido bruto completo (para conferência) ===\n");
  console.log(JSON.stringify(pedido, null, 2));
}

main().catch((err) => {
  console.error("\nErro:", err.message);
  process.exit(1);
});
