// Backfill de frete/desconto/acréscimo/taxaMarketplace para pedidos do
// Mercado Livre que já existiam no banco antes desses campos existirem (ver
// commit "feat: detalhe da venda ganha frete real, desconto, acrescimo e
// valor liquido", e a adição posterior de taxaMarketplace).
//
// O fluxo normal de sincronização (ingerirPedido em ingestao-pedido.service.ts)
// só reconcilia status de pedido já existente — nunca revisita frete/desconto/
// acréscimo/taxaMarketplace. Sem este script, todo pedido importado antes de
// cada um desses campos existir fica pra sempre sem o valor real, mesmo que
// o pedido de verdade tenha tido frete, cupom, juro de parcelamento ou
// comissão do canal.
//
// Confirmado ao vivo (22/08/2026): a API do Mercado Livre devolve `sale_fee`
// normalmente pra pedidos de meses atrás — a lacuna nunca foi a API não ter
// o dado, foi este mesmo bug de sincronização (`ingerirPedido` só reconcilia
// status, nunca revisita os campos enriquecidos) já batido uma vez pra
// frete/desconto/acréscimo e nunca estendido pra taxaMarketplace quando ela
// foi adicionada.
//
// Por padrão só toca pedidos com frete/desconto/acréscimo ainda em "0" OU
// com algum item sem taxaMarketplace — rodar de novo é seguro, não
// reprocessa quem já foi enriquecido. Passe --all para forçar reprocessar
// todo mundo.
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

  // PostgREST corta em 1000 linhas por padrão — sem paginar aqui, marcas com
  // mais de 1000 pedidos ML (ex.: wuwu, com 3039) tinham a maioria dos
  // pedidos simplesmente nunca lida, silenciosamente, em toda execução
  // anterior (nenhum erro, só um resultado incompleto). Confirmado ao vivo
  // em 23/08/2026: wuwu ficou com 1922 itens sem taxaMarketplace mesmo após
  // duas rodadas do backfill, enquanto marcas abaixo de 1000 pedidos (karzi,
  // armarinhos_lima) chegaram a 100% de cobertura nas mesmas rodadas.
  const PAGINA = 1000;
  const todosPedidos = [];
  for (let inicio = 0; ; inicio += PAGINA) {
    const { data: pagina, error } = await supabase
      .from("pedido")
      .select("id, provider_order_id, frete, desconto, acrescimo, pedido_item(id, quantidade, taxa_marketplace, produto:produto_id(sku))")
      .eq("org_id", orgId)
      .eq("brand_id", marca.id)
      .eq("canal", "mercadolivre")
      .not("provider_order_id", "is", null)
      .order("id")
      .range(inicio, inicio + PAGINA - 1);
    if (error) throw new Error(`Falha ao listar pedidos de ${marca.slug}: ${error.message}`);
    todosPedidos.push(...(pagina ?? []));
    if (!pagina || pagina.length < PAGINA) break;
  }

  // Filtrado em JS, não no PostgREST: "algum item sem taxaMarketplace" é uma
  // condição sobre a tabela relacionada (pedido_item), que o PostgREST não
  // filtra de forma direta numa query aninhada como esta.
  const pedidos = forcarTodos
    ? todosPedidos
    : (todosPedidos ?? []).filter((p) =>
        // PostgREST compara pelo valor numérico depois de fazer o cast, não
        // pela string — "0" bate com "0.00" armazenado na coluna numeric(12,2).
        Number(p.frete) === 0 || Number(p.desconto) === 0 || Number(p.acrescimo) === 0
        || (p.pedido_item ?? []).some((item) => item.taxa_marketplace === null),
      );

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

      // Casa cada order_item da API com o pedido_item do banco pelo SKU do
      // vendedor (mesmo campo usado na ingestão normal, ver
      // normalizarPedidoMercadoLivre em mercadolivre.provider.ts). Quando
      // duas linhas do pedido têm o mesmo SKU (raro, mas possível), casa na
      // ordem em que aparecem — não há outro identificador estável aqui.
      const itensBanco = [...(p.pedido_item ?? [])];
      const taxasPorItem = [];
      for (const orderItem of order.order_items ?? []) {
        const sku = orderItem.item?.seller_sku;
        if (typeof orderItem.sale_fee !== "number" || !sku) continue;
        const indice = itensBanco.findIndex((item) => item.produto?.sku === sku);
        if (indice === -1) continue;
        const [itemBanco] = itensBanco.splice(indice, 1);
        if (itemBanco.taxa_marketplace === null) {
          taxasPorItem.push({ id: itemBanco.id, taxaMarketplace: orderItem.sale_fee });
        }
      }

      const mudouPedido = frete !== Number(p.frete) || desconto !== Number(p.desconto) || acrescimo !== Number(p.acrescimo);
      const mudou = mudouPedido || taxasPorItem.length > 0;
      const rotulo = `  #${p.provider_order_id}: frete ${frete} · desconto ${desconto} · acréscimo ${acrescimo}`
        + (taxasPorItem.length > 0 ? ` · taxa ${taxasPorItem.map((t) => t.taxaMarketplace).join("+")}` : "");

      if (!mudou) {
        console.log(`${rotulo} (sem mudança)`);
      } else if (dryRun) {
        console.log(`${rotulo} (dry-run, não gravado)`);
        atualizados += 1;
      } else {
        if (mudouPedido) {
          const { error: erroUpdate } = await supabase
            .from("pedido")
            .update({ frete: String(frete), desconto: String(desconto), acrescimo: String(acrescimo) })
            .eq("id", p.id);
          if (erroUpdate) throw new Error(erroUpdate.message);
        }
        for (const item of taxasPorItem) {
          const { error: erroItem } = await supabase
            .from("pedido_item")
            .update({ taxa_marketplace: String(item.taxaMarketplace) })
            .eq("id", item.id);
          if (erroItem) throw new Error(erroItem.message);
        }
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
