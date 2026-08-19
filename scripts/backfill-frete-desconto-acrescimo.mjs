// Backfill de frete/desconto/acréscimo para pedidos do Mercado Livre que já
// existiam no banco antes desses campos existirem (ver commit "feat: detalhe
// da venda ganha frete real, desconto, acrescimo e valor liquido").
//
// O fluxo normal de sincronização (ingerirPedido em ingestao-pedido.service.ts)
// só reconcilia status de pedido já existente — nunca revisita frete/desconto/
// acréscimo. Sem este script, todo pedido importado antes da feature fica pra
// sempre com esses campos em "0", mesmo que o pedido real tenha tido frete,
// cupom ou juro de parcelamento.
//
// Por padrão só toca pedidos com os três campos ainda em "0" (o estado que
// todo pedido pré-feature tem) — rodar de novo é seguro, não reprocessa quem
// já foi enriquecido. Passe --all para forçar reprocessar todo mundo.
//
// Uso:
//   node scripts/backfill-frete-desconto-acrescimo.mjs                 # todas as marcas, só os que faltam
//   node scripts/backfill-frete-desconto-acrescimo.mjs karzi           # só uma marca
//   node scripts/backfill-frete-desconto-acrescimo.mjs --dry-run       # mostra o que mudaria, não grava
//   node scripts/backfill-frete-desconto-acrescimo.mjs --all           # reprocessa mesmo quem já tem valor

import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");
loadEnvConfig(process.cwd());

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const forcarTodos = args.includes("--all");
const marcaFiltro = args.find((a) => !a.startsWith("--"));

const orgId = process.env.DEFAULT_ORG_ID;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const clientId = process.env.ML_CLIENT_ID;
const clientSecret = process.env.ML_CLIENT_SECRET;

if (!orgId || !supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Faltam DEFAULT_ORG_ID / NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env.local.",
  );
}
if (!clientId || !clientSecret) {
  throw new Error("Faltam ML_CLIENT_ID / ML_CLIENT_SECRET no .env.local.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey);
const baseUrl = "https://api.mercadolibre.com";

// Mesma lógica de obterTokenMercadoLivre() em mercadolivre.provider.ts: o
// token de verdade vive em canal_tokens (renovado a cada hora pelo A23), o
// env var é só um fallback estático que não é renovado sozinho.
async function obterAccessToken(marcaId, marcaSlug) {
  const upper = marcaSlug.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  const tokenRow = await supabase
    .from("canal_tokens")
    .select("access_token, expires_at")
    .eq("org_id", orgId).eq("brand_id", marcaId).eq("canal", "mercadolivre")
    .maybeSingle();

  const expirado = tokenRow.data?.expires_at
    ? new Date(tokenRow.data.expires_at).getTime() <= Date.now() + 60_000
    : true;

  if (tokenRow.data?.access_token && !expirado) return tokenRow.data.access_token;

  const fallback = process.env[`ML_ACCESS_TOKEN_${upper}`];
  if (fallback && !fallback.startsWith("your-")) {
    console.log(`  [token] canal_tokens sem token válido — usando ML_ACCESS_TOKEN_${upper} do .env.local.`);
    return fallback;
  }

  throw new Error(
    `Sem token válido para ${marcaSlug}: canal_tokens está ${tokenRow.data ? "expirado" : "vazio"} ` +
    `e ML_ACCESS_TOKEN_${upper} é só um placeholder. Reconecte em /configuracoes.`,
  );
}

async function buscarCustoEnvioVendedor(auth, shippingId) {
  try {
    const custos = await fetch(`${baseUrl}/shipments/${shippingId}/costs`, { headers: auth }).then((r) => r.json());
    if (!custos.senders?.length) return null;
    return custos.senders.reduce((soma, s) => soma + (s.cost ?? 0), 0);
  } catch {
    return null;
  }
}

// Mesma conta que normalizarPedidoMercadoLivre() faz em mercadolivre.provider.ts
// — duplicada aqui de propósito: scripts/*.mjs não importam TS de src/ (ver os
// outros scripts desta pasta), então a lógica é replicada, não reaproveitada.
function calcularAcrescimo(order) {
  if (!order.payments?.length) return 0;
  return order.payments.reduce((soma, p) => soma + Math.max(0, (p.total_paid_amount ?? 0) - (p.transaction_amount ?? 0)), 0);
}

async function processarMarca(marca) {
  console.log(`\n=== ${marca.slug} ===`);
  const accessToken = await obterAccessToken(marca.id, marca.slug);
  const auth = { Authorization: `Bearer ${accessToken}` };

  let query = supabase
    .from("pedido")
    .select("id, provider_order_id, frete, desconto, acrescimo")
    .eq("org_id", orgId)
    .eq("brand_id", marca.id)
    .eq("canal", "mercadolivre")
    .not("provider_order_id", "is", null);

  if (!forcarTodos) {
    // PostgREST compara pelo valor numérico depois de fazer o cast, não pela
    // string — "0" bate com "0.00" armazenado na coluna numeric(12,2).
    query = query.eq("frete", "0").eq("desconto", "0").eq("acrescimo", "0");
  }

  const { data: pedidos, error } = await query;
  if (error) throw new Error(`Falha ao listar pedidos de ${marca.slug}: ${error.message}`);

  if (!pedidos?.length) {
    console.log("  Nenhum pedido pendente de backfill.");
    return { tocados: 0, atualizados: 0, falhas: 0 };
  }
  console.log(`  ${pedidos.length} pedido(s) para revisar.`);

  let atualizados = 0;
  let falhas = 0;

  for (const p of pedidos) {
    try {
      const order = await fetch(`${baseUrl}/orders/${p.provider_order_id}`, { headers: auth }).then((r) => r.json());
      if (!order.id) throw new Error(`resposta sem id: ${JSON.stringify(order).slice(0, 200)}`);

      const shippingId = order.shipping?.id;
      const custoEnvio = shippingId ? await buscarCustoEnvioVendedor(auth, shippingId) : null;
      const frete = custoEnvio ?? 0;
      const desconto = typeof order.coupon?.amount === "number" ? order.coupon.amount : 0;
      const acrescimo = calcularAcrescimo(order);

      const mudou = frete !== Number(p.frete) || desconto !== Number(p.desconto) || acrescimo !== Number(p.acrescimo);
      const rotulo = `  #${p.provider_order_id}: frete ${frete} · desconto ${desconto} · acréscimo ${acrescimo}`;

      if (!mudou) {
        console.log(`${rotulo} (sem mudança)`);
      } else if (dryRun) {
        console.log(`${rotulo} (dry-run, não gravado)`);
        atualizados += 1;
      } else {
        const { error: erroUpdate } = await supabase
          .from("pedido")
          .update({ frete: String(frete), desconto: String(desconto), acrescimo: String(acrescimo) })
          .eq("id", p.id);
        if (erroUpdate) throw new Error(erroUpdate.message);
        console.log(`${rotulo} (gravado)`);
        atualizados += 1;
      }
    } catch (err) {
      falhas += 1;
      console.error(`  #${p.provider_order_id}: falhou — ${err.message}`);
    }
    // Ritmo gentil com a API — este é um backfill em lote, não uma sincronização
    // em tempo real, não há pressa que justifique arriscar rate limit.
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  return { tocados: pedidos.length, atualizados, falhas };
}

async function main() {
  let query = supabase.from("brand").select("id, slug").eq("org_id", orgId).eq("active", true);
  if (marcaFiltro) query = query.eq("slug", marcaFiltro);
  const { data: marcas, error } = await query;
  if (error) throw new Error(`Falha ao listar marcas: ${error.message}`);
  if (!marcas?.length) throw new Error(marcaFiltro ? `Marca "${marcaFiltro}" não encontrada ou inativa.` : "Nenhuma marca ativa encontrada.");

  if (dryRun) console.log("Modo dry-run: nada será gravado no banco.\n");

  let totalTocados = 0, totalAtualizados = 0, totalFalhas = 0;
  for (const marca of marcas) {
    try {
      const r = await processarMarca(marca);
      totalTocados += r.tocados; totalAtualizados += r.atualizados; totalFalhas += r.falhas;
    } catch (err) {
      console.error(`\n${marca.slug}: pulada — ${err.message}`);
    }
  }

  console.log(`\n=== Resumo ===\n${totalTocados} pedido(s) revisado(s), ${totalAtualizados} atualizado(s), ${totalFalhas} falha(s).`);
}

main().catch((err) => {
  console.error("\nErro:", err.message);
  process.exit(1);
});
