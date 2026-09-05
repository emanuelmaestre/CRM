// Diagnóstico de leitura pura: compara pedido a pedido o que a API do Mercado
// Livre devolve com o que existe na tabela `pedido` do CRM, para um período e
// uma marca. Não grava nada.
//
// Uso:
//   node scripts/diag-ml-x-crm.mjs wuwu 2026-08-01 2026-08-29

import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");
loadEnvConfig(process.cwd());

const [marcaSlug, inicio, fim] = process.argv.slice(2);
if (!marcaSlug || !inicio || !fim) {
  console.error("Uso: node scripts/diag-ml-x-crm.mjs <marca> <YYYY-MM-DD> <YYYY-MM-DD>");
  process.exit(1);
}

const orgId = process.env.DEFAULT_ORG_ID;
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const upper = marcaSlug.toUpperCase().replace(/[^A-Z0-9]+/g, "_");

async function marcaId() {
  const { data } = await supabase.from("brand").select("id").eq("org_id", orgId).eq("slug", marcaSlug).maybeSingle();
  if (!data?.id) throw new Error(`Marca ${marcaSlug} não encontrada`);
  return data.id;
}

async function accessToken(brandId) {
  const { data } = await supabase.from("canal_tokens")
    .select("access_token, expires_at").eq("org_id", orgId).eq("brand_id", brandId).eq("canal", "mercadolivre").maybeSingle();
  const expirado = data?.expires_at ? new Date(data.expires_at).getTime() <= Date.now() + 60_000 : true;
  if (data?.access_token && !expirado) return data.access_token;
  const fallback = process.env[`ML_ACCESS_TOKEN_${upper}`];
  if (fallback && !fallback.startsWith("your-")) return fallback;
  throw new Error("sem token válido");
}

function diasDoPeriodo(a, b) {
  const out = [];
  for (let d = new Date(`${a}T12:00:00Z`); d <= new Date(`${b}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

async function buscarPedidosML(token, sellerId, dia) {
  const auth = { Authorization: `Bearer ${token}` };
  const de = `${dia}T00:00:00.000-03:00`;
  const ate = `${dia}T23:59:59.999-03:00`;
  const achados = [];
  for (let offset = 0; offset < 2000; offset += 50) {
    const url = `https://api.mercadolibre.com/orders/search?seller=${sellerId}`
      + `&order.date_created.from=${encodeURIComponent(de)}&order.date_created.to=${encodeURIComponent(ate)}`
      + `&limit=50&offset=${offset}&sort=date_asc`;
    const r = await fetch(url, { headers: auth });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    const json = await r.json();
    achados.push(...(json.results ?? []));
    if (achados.length >= (json.paging?.total ?? 0) || (json.results ?? []).length === 0) break;
  }
  return achados;
}

const brandId = await marcaId();
const token = await accessToken(brandId);
const me = await fetch("https://api.mercadolibre.com/users/me", { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
console.log(`[seller] ${marcaSlug} → ${me.id} (${me.nickname})`);

const dias = diasDoPeriodo(inicio, fim);
const ml = [];
for (const dia of dias) {
  const pedidos = await buscarPedidosML(token, me.id, dia);
  ml.push(...pedidos);
  process.stdout.write(`\r[ML] ${dia}: ${pedidos.length} — acumulado ${ml.length}   `);
}
console.log("");

// Dedup (um pedido pode aparecer em dois dias por causa de janela/limite)
const porId = new Map();
for (const p of ml) porId.set(String(p.id), p);
const pedidosML = [...porId.values()];
const duplicadosNasFatias = ml.length - pedidosML.length;

// Dump opcional dos pedidos crus, para conferência offline: DUMP=caminho.json
import { writeFileSync } from "node:fs";
if (process.env.DUMP) writeFileSync(process.env.DUMP, JSON.stringify(pedidosML.map((p) => ({
  id: String(p.id), date_created: p.date_created, date_closed: p.date_closed, status: p.status,
  status_detail: p.status_detail, total_amount: p.total_amount, paid_amount: p.paid_amount,
  unidades: (p.order_items ?? []).reduce((s, i) => s + i.quantity, 0),
  pack_id: p.pack_id ?? null, cancel_detail: p.cancel_detail ?? null,
}))));

// ── CRM ────────────────────────────────────────────────────────────────
const crm = [];
for (let de = 0; ; de += 1000) {
  const { data, error } = await supabase.from("pedido")
    .select("provider_order_id, status, total, criado_em, origem_ingestao")
    .eq("org_id", orgId).eq("brand_id", brandId).eq("canal", "mercadolivre")
    .gte("criado_em", `${inicio}T00:00:00-03:00`).lte("criado_em", `${fim}T23:59:59.999-03:00`)
    .range(de, de + 999);
  if (error) throw new Error(error.message);
  crm.push(...data);
  if (data.length < 1000) break;
}

const crmPorId = new Map(crm.map((p) => [String(p.provider_order_id), p]));
const CANCELADOS = new Set(["cancelado", "devolvido"]);

const soma = (arr, f) => arr.reduce((s, x) => s + Number(f(x) ?? 0), 0);
const agruparStatus = (arr, status, valor) => Object.fromEntries(
  [...arr.reduce((mapa, item) => {
    const chave = status(item);
    const atual = mapa.get(chave) ?? { pedidos: 0, valor: 0 };
    atual.pedidos += 1;
    atual.valor += Number(valor(item) ?? 0);
    mapa.set(chave, atual);
    return mapa;
  }, new Map())]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([chave, resumo]) => [chave, { ...resumo, valor: resumo.valor.toFixed(2) }]),
);

console.log("\n=== MERCADO LIVRE (API, data_created em -03:00) ===");
console.log("pedidos           :", pedidosML.length);
console.log("duplicados removidos entre fatias:", duplicadosNasFatias);
const porStatus = {};
for (const p of pedidosML) porStatus[p.status] = (porStatus[p.status] ?? 0) + 1;
console.log("por status        :", porStatus);
console.log("valor por status  :", agruparStatus(pedidosML, (p) => p.status, (p) => p.total_amount));
console.log("soma total_amount :", soma(pedidosML, (p) => p.total_amount).toFixed(2));
const naoCancelados = pedidosML.filter((p) => p.status !== "cancelled");
console.log("sem cancelados    :", naoCancelados.length, soma(naoCancelados, (p) => p.total_amount).toFixed(2));
console.log("unidades          :", soma(pedidosML, (p) => (p.order_items ?? []).reduce((s, i) => s + i.quantity, 0)));
const reembolsosParciais = pedidosML
  .filter((p) => p.status === "partially_refunded")
  .map((p) => ({
    id: String(p.id),
    total: Number(p.total_amount).toFixed(2),
    reembolsado: soma(p.payments ?? [], (pagamento) => pagamento.transaction_amount_refunded).toFixed(2),
    atualizadoEm: p.date_last_updated ?? p.last_updated ?? null,
  }));
if (reembolsosParciais.length > 0) console.log("reembolsos parciais:", reembolsosParciais);

console.log("\n=== CRM (criado_em em -03:00) ===");
console.log("pedidos           :", crm.length);
const porStatusCrm = {};
for (const p of crm) porStatusCrm[p.status] = (porStatusCrm[p.status] ?? 0) + 1;
console.log("por status        :", porStatusCrm);
console.log("valor por status  :", agruparStatus(crm, (p) => p.status, (p) => p.total));
console.log("soma total        :", soma(crm, (p) => p.total).toFixed(2));
const vivos = crm.filter((p) => !CANCELADOS.has(p.status));
console.log("sem cancel/devol  :", vivos.length, soma(vivos, (p) => p.total).toFixed(2));

const faltando = pedidosML.filter((p) => !crmPorId.has(String(p.id)));
const sobrando = crm.filter((p) => !porId.has(String(p.provider_order_id)));
console.log("\n=== DIFERENÇA ===");
console.log("no ML e não no CRM:", faltando.length, soma(faltando, (p) => p.total_amount).toFixed(2));
console.log("no CRM e não no ML:", sobrando.length, soma(sobrando, (p) => p.total).toFixed(2));

for (const p of faltando.slice(0, 60)) {
  console.log(`  falta #${p.id} ${p.date_created} ${p.status.padEnd(10)} ${String(p.total_amount).padStart(9)} ${(p.status_detail ?? "")}`);
}
for (const p of sobrando.slice(0, 30)) {
  console.log(`  sobra #${p.provider_order_id} ${p.criado_em} ${p.status} ${p.total} (${p.origem_ingestao})`);
}

// Divergência de valor/status nos que existem dos dois lados
let divValor = 0, divStatus = 0;
const linhas = [];
for (const p of pedidosML) {
  const c = crmPorId.get(String(p.id));
  if (!c) continue;
  const dif = Number(p.total_amount) - Number(c.total);
  const cancelML = p.status === "cancelled";
  const cancelCRM = CANCELADOS.has(c.status);
  if (Math.abs(dif) > 0.005) { divValor++; linhas.push(`  valor #${p.id} ML ${p.total_amount} × CRM ${c.total} (${dif.toFixed(2)})`); }
  if (cancelML !== cancelCRM) { divStatus++; linhas.push(`  status #${p.id} ML ${p.status}/${p.status_detail ?? "-"} × CRM ${c.status} tot ${c.total}`); }
}
console.log(`\ndivergência de valor : ${divValor}`);
console.log(`divergência de cancelamento : ${divStatus}`);
console.log(linhas.slice(0, 80).join("\n"));
