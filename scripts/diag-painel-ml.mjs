// Espelha, contra a API do Mercado Livre, os oito números do "Resumo de
// desempenho" do painel do vendedor — e põe ao lado o que o CRM tem para o
// mesmo período. Leitura pura: não grava nada.
//
//   node scripts/diag-painel-ml.mjs wuwu 2026-08-01
import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
require("@next/env").loadEnvConfig(process.cwd());

const [marcaSlug, inicio] = process.argv.slice(2);
const orgId = process.env.DEFAULT_ORG_ID;
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: marca } = await sb.from("brand").select("id").eq("org_id", orgId).eq("slug", marcaSlug).maybeSingle();
const { data: tok } = await sb.from("canal_tokens").select("access_token")
  .eq("org_id", orgId).eq("brand_id", marca.id).eq("canal", "mercadolivre").maybeSingle();
const auth = { Authorization: `Bearer ${tok.access_token}` };
const me = await fetch("https://api.mercadolibre.com/users/me", { headers: auth }).then((r) => r.json());

const agora = new Date();
const dias = [];
for (let d = new Date(`${inicio}T12:00:00Z`); d <= agora; d.setUTCDate(d.getUTCDate() + 1)) {
  dias.push(d.toISOString().slice(0, 10));
}

const pedidos = new Map();
for (const dia of dias) {
  for (let offset = 0; offset < 2000; offset += 50) {
    const url = `https://api.mercadolibre.com/orders/search?seller=${me.id}`
      + `&order.date_created.from=${encodeURIComponent(`${dia}T00:00:00.000-03:00`)}`
      + `&order.date_created.to=${encodeURIComponent(`${dia}T23:59:59.999-03:00`)}`
      + `&limit=50&offset=${offset}&sort=date_asc`;
    const r = await fetch(url, { headers: auth });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    const json = await r.json();
    for (const p of json.results ?? []) pedidos.set(String(p.id), p);
    if ((json.results ?? []).length < 50) break;
  }
  process.stdout.write(`\r[ML] ${dia} — ${pedidos.size} pedidos   `);
}
console.log("");

const todos = [...pedidos.values()];
const dia = (iso, off) => new Date(new Date(iso).getTime() + off * 3600e3).toISOString().slice(0, 10);
const fimDia = agora.toISOString().slice(0, 10);
const noPeriodo = (off) => todos.filter((p) => {
  const d = dia(p.date_created, off);
  return d >= inicio && d <= fimDia && new Date(p.date_created) <= agora;
});
const unidades = (lista) => lista.reduce((s, p) => s + (p.order_items ?? []).reduce((x, i) => x + i.quantity, 0), 0);
const soma = (lista) => lista.reduce((s, p) => s + Number(p.total_amount ?? 0), 0);

// Visitas: mesma janela, endpoint próprio do vendedor.
let visitas = null;
try {
  // A API só aceita data pura aqui (com hora ela devolve 400) e lê o
  // intervalo no fuso do ML: date_to é EXCLUSIVO, então o dia de hoje só
  // entra pedindo amanhã.
  const amanha = new Date(agora.getTime() + 86400000).toISOString().slice(0, 10);
  const url = `https://api.mercadolibre.com/users/${me.id}/items_visits?date_from=${inicio}&date_to=${amanha}`;
  const r = await fetch(url, { headers: auth });
  const json = await r.json();
  visitas = typeof json.total_visits === "number" ? json.total_visits : null;
  if (visitas === null) console.log("[visitas] resposta inesperada:", JSON.stringify(json).slice(0, 200));
} catch (erro) { console.log("[visitas] falhou:", erro.message); }

const brl = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
for (const off of [-4, -3]) {
  const lista = noPeriodo(off);
  const canceladas = lista.filter((p) => p.status === "cancelled");
  const un = unidades(lista);
  const bruto = soma(lista);
  console.log(`\n═══ ${marcaSlug.toUpperCase()} · Mercado Livre · ${inicio} → hoje · janela em GMT${off} ${off === -4 ? "(a do painel)" : "(a do CRM)"} ═══`);
  console.log(`  Vendas brutas .............. ${brl(bruto)}`);
  console.log(`  Unidades vendidas .......... ${un}`);
  console.log(`  Preço médio por unidade .... ${brl(un ? bruto / un : 0)}`);
  console.log(`  Visitas .................... ${visitas ?? "—"}`);
  console.log(`  Quantidade de vendas ....... ${lista.length}`);
  console.log(`  Conversão .................. ${visitas ? ((lista.length / visitas) * 100).toFixed(1).replace(".", ",") + "%" : "—"}`);
  console.log(`  Preço médio por venda ...... ${brl(lista.length ? bruto / lista.length : 0)}`);
  console.log(`  Vendas canceladas .......... ${canceladas.length} (${brl(soma(canceladas))})`);
}

// ── CRM, mesmo recorte ────────────────────────────────────────────────────
const crm = [];
for (let de = 0; ; de += 1000) {
  const { data } = await sb.from("pedido").select("provider_order_id, status, total")
    .eq("org_id", orgId).eq("brand_id", marca.id).eq("canal", "mercadolivre")
    .gte("criado_em", `${inicio}T00:00:00-03:00`).lte("criado_em", agora.toISOString()).range(de, de + 999);
  crm.push(...data);
  if (data.length < 1000) break;
}
const CANC = new Set(["cancelado", "devolvido"]);
const vivos = crm.filter((p) => !CANC.has(p.status));
const cancCrm = crm.filter((p) => CANC.has(p.status));
const { data: fila } = await sb.from("pedido_ignorado").select("payload")
  .eq("org_id", orgId).eq("brand_id", marca.id).is("resolvido_em", null).is("descartado_em", null);
const filaNoPeriodo = fila.filter((r) => {
  const d = String(r.payload?.criadoEm ?? "");
  return d >= inicio && new Date(d) <= agora;
});

const somaCrm = (l) => l.reduce((s, p) => s + Number(p.total ?? 0), 0);
const somaFila = filaNoPeriodo.reduce((s, r) => s + Number(r.payload?.total ?? 0), 0);
console.log(`\n═══ CRM · mesma marca e canal · dia em Brasília ═══`);
console.log(`  Faturamento (sem cancelados) ... ${brl(somaCrm(vivos))}  (${vivos.length} pedidos)`);
console.log(`  Cancelados/devolvidos .......... ${brl(somaCrm(cancCrm))}  (${cancCrm.length})`);
console.log(`  Soma das duas .................. ${brl(somaCrm(crm))}  (${crm.length})`);
console.log(`  Fila de não importados ......... ${brl(somaFila)}  (${filaNoPeriodo.length})`);
console.log(`  Total conhecido pelo CRM ....... ${brl(somaCrm(crm) + somaFila)}  (${crm.length + filaNoPeriodo.length})`);

const idsCrm = new Set(crm.map((p) => String(p.provider_order_id)));
const faltando = noPeriodo(-3).filter((p) => !idsCrm.has(String(p.id)));
console.log(`\n  Pedidos no ML e não no CRM ..... ${faltando.length} (${brl(soma(faltando))})`);
for (const p of faltando) console.log(`     #${p.id} ${p.date_created} ${p.status} ${brl(Number(p.total_amount))}`);
console.log(`  Diferença ML(GMT-3) − CRM ...... ${brl(soma(noPeriodo(-3)) - (somaCrm(crm) + somaFila))}`);
