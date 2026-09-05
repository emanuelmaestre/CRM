// Diagnóstico de leitura pura de um pedido do Mercado Livre.
// Não imprime comprador/endereço e não grava nada.
// Uso: node scripts/diag-pedido-ml.mjs wuwu 2000018233553308

import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");
loadEnvConfig(process.cwd());

const [marcaSlug, pedidoId] = process.argv.slice(2);
if (!marcaSlug || !pedidoId) {
  console.error("Uso: node scripts/diag-pedido-ml.mjs <marca> <pedido-id>");
  process.exit(1);
}

const orgId = process.env.DEFAULT_ORG_ID;
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const { data: marca, error: erroMarca } = await supabase
  .from("brand")
  .select("id, slug")
  .eq("org_id", orgId)
  .eq("slug", marcaSlug)
  .maybeSingle();
if (erroMarca || !marca) throw new Error(erroMarca?.message ?? `Marca ${marcaSlug} não encontrada.`);

const [{ data: conta, error: erroConta }, { data: tokenRow, error: erroToken }] = await Promise.all([
  supabase.from("channel_account")
    .select("id, nome, meta")
    .eq("org_id", orgId)
    .eq("brand_id", marca.id)
    .eq("tipo", "mercadolivre")
    .maybeSingle(),
  supabase.from("canal_tokens")
    .select("access_token")
    .eq("org_id", orgId)
    .eq("brand_id", marca.id)
    .eq("canal", "mercadolivre")
    .maybeSingle(),
]);
if (erroConta || !conta) throw new Error(erroConta?.message ?? "Conta ML não encontrada.");
if (erroToken || !tokenRow?.access_token) throw new Error(erroToken?.message ?? "Token ML não encontrado.");

const resposta = await fetch(`https://api.mercadolibre.com/orders/${encodeURIComponent(pedidoId)}`, {
  headers: { Authorization: `Bearer ${tokenRow.access_token}` },
});
if (!resposta.ok) throw new Error(`Mercado Livre respondeu ${resposta.status}: ${await resposta.text()}`);
const pedido = await resposta.json();

const itens = (pedido.order_items ?? []).map((linha) => ({
  listingId: linha.item?.id ? String(linha.item.id) : null,
  variationId: linha.item?.variation_id ? String(linha.item.variation_id) : null,
  sellerSku: linha.item?.seller_sku?.trim() || null,
  titulo: linha.item?.title ?? null,
  quantidade: linha.quantity,
  precoUnitario: linha.unit_price,
}));

console.log("PEDIDO", {
  id: String(pedido.id),
  status: pedido.status,
  criadoEm: pedido.date_created,
  atualizadoEm: pedido.date_last_updated ?? pedido.last_updated ?? null,
  total: pedido.total_amount,
  itens,
});

const filtros = itens.filter((item) => item.listingId || item.sellerSku);
for (const item of filtros) {
  const consultas = [];
  if (item.listingId) {
    consultas.push(supabase.from("produto_canal")
      .select("external_listing_id, external_warehouse_id, external_sku_id, ativo, produto:produto_id(sku, nome, deleted_at)")
      .eq("org_id", orgId)
      .eq("channel_account_id", conta.id)
      .eq("external_listing_id", item.listingId));
  }
  if (item.sellerSku) {
    consultas.push(supabase.from("produto_canal")
      .select("external_listing_id, external_warehouse_id, external_sku_id, ativo, produto:produto_id(sku, nome, deleted_at)")
      .eq("org_id", orgId)
      .eq("channel_account_id", conta.id)
      .eq("external_sku_id", item.sellerSku));
  }
  const resultados = await Promise.all(consultas);
  console.log("MAPEAMENTOS", {
    item,
    porAnuncio: resultados[0]?.data ?? [],
    porSku: resultados[1]?.data ?? resultados[0]?.data ?? [],
    erros: resultados.map((r) => r.error?.message).filter(Boolean),
  });
}

const { data: crm, error: erroCrm } = await supabase.from("pedido")
  .select("provider_order_id, status, total, criado_em")
  .eq("org_id", orgId)
  .eq("channel_account_id", conta.id)
  .eq("provider_order_id", pedidoId);
const { data: ignorados, error: erroIgnorados } = await supabase.from("pedido_ignorado")
  .select("provider_order_id, causa, motivo, primeira_vez_em, ultima_vez_em, resolvido_em, descartado_em")
  .eq("org_id", orgId)
  .eq("channel_account_id", conta.id)
  .eq("provider_order_id", pedidoId);

console.log("CRM", crm ?? [], erroCrm?.message ?? "");
console.log("FILA", ignorados ?? [], erroIgnorados?.message ?? "");
console.log("COBERTURA", conta.meta?.pedidosUltimaColetaCompleta ?? null);

if (!process.argv.includes("--detalhe")) {
  const desdeOperacao = new Date(Date.now() - 5 * 86_400_000).toISOString();
  const [{ data: jobs }, { data: sincronizacoes }] = await Promise.all([
    supabase.from("job_run")
      .select("nome, status, iniciado_em, finalizado_em, erro")
      .eq("org_id", orgId)
      .in("nome", ["A24-poll-pedidos", "A34-reconciliar-pedidos"])
      .gte("iniciado_em", desdeOperacao)
      .order("iniciado_em", { ascending: false })
      .limit(30),
    supabase.from("sincronizacao_execucao")
      .select("pedidos_status, pedidos_resultado, pedidos_erro, iniciado_em, finalizado_em")
      .eq("org_id", orgId)
      .eq("channel_account_id", conta.id)
      .gte("iniciado_em", desdeOperacao)
      .order("iniciado_em", { ascending: false })
      .limit(15),
  ]);
  console.log("JOBS_RECENTES", jobs ?? []);
  console.log("SINCRONIZACOES_RECENTES", sincronizacoes ?? []);
}
