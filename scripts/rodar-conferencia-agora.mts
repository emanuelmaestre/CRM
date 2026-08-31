/**
 * Roda o agente de conferência financeira AGORA, uma vez, a pedido do operador
 * — em vez de esperar o A35 das 6h. Depois disso o cron segue normal.
 *
 * Faz o mesmo que o A35: para cada conta de canal conectada, chama
 * `auditarPedidosDaConta` (backstop + re-busca na API + regrava + ledger).
 *
 *   node --import tsx --import ./scripts/register-server-only.mjs \
 *        --env-file=.env.local scripts/rodar-conferencia-agora.mts
 */
import { and, eq, gte, inArray } from "drizzle-orm";
import { db, getDb } from "../src/shared/lib/db/index";
import { brand } from "../src/shared/lib/db/schema/org";
import { channelAccount } from "../src/shared/lib/db/schema/canais";
import { conferenciaFinanceira, pedido, pedidoItem } from "../src/shared/lib/db/schema/vendas";
import { auditarPedidosDaConta } from "../src/modules/vendas/application/conferencia-financeira.service";
import { decomporPedido } from "../src/modules/vendas/domain/auditoria-financeira";

const orgId = process.env.DEFAULT_ORG_ID;
if (!orgId) throw new Error("DEFAULT_ORG_ID obrigatório.");

/** Verificação INDEPENDENTE: decompõe todo pedido dos últimos N dias e conta
 *  quantos não fecham — ignorando marca de versão e ledger. É a resposta a
 *  "está batendo?". */
async function verificar(dias: number) {
  const desde = new Date(Date.now() - dias * 86_400_000);
  const linhas = await db
    .select({
      id: pedido.id, canal: pedido.canal, providerOrderId: pedido.providerOrderId,
      total: pedido.total, frete: pedido.frete, desconto: pedido.desconto,
      acrescimo: pedido.acrescimo, valorLiquido: pedido.valorLiquido,
      dadosOrigem: pedido.dadosOrigem, createdAt: pedido.createdAt,
    })
    .from(pedido)
    .where(and(
      eq(pedido.orgId, orgId!),
      gte(pedido.createdAt, desde),
      inArray(pedido.canal, ["mercadolivre", "shopee", "tiktokshop"]),
    ));
  const itens = await db
    .select({ pedidoId: pedidoItem.pedidoId, precoUnitario: pedidoItem.precoUnitario, quantidade: pedidoItem.quantidade, taxaMarketplace: pedidoItem.taxaMarketplace })
    .from(pedidoItem)
    .where(inArray(pedidoItem.pedidoId, linhas.map((l) => l.id)));
  const porPedido = new Map<string, typeof itens>();
  for (const it of itens) { const a = porPedido.get(it.pedidoId) ?? []; a.push(it); porPedido.set(it.pedidoId, a); }

  const agora = new Date();
  const buckets: Record<string, number> = {};
  const flags: string[] = [];
  for (const l of linhas) {
    const its = (porPedido.get(l.id) ?? []).map((i) => ({ precoUnitario: i.precoUnitario, quantidade: i.quantidade, taxaMarketplace: i.taxaMarketplace }));
    const fin = (l.dadosOrigem as { financeiroInformado?: boolean } | null)?.financeiroInformado;
    const d = decomporPedido({
      canal: l.canal, total: l.total, frete: l.frete, desconto: l.desconto, acrescimo: l.acrescimo,
      valorLiquido: l.valorLiquido, financeiroInformado: fin, itens: its,
      idadeDias: Math.max(0, (agora.getTime() - l.createdAt.getTime()) / 86_400_000),
    });
    buckets[d.classificacao] = (buckets[d.classificacao] ?? 0) + 1;
    if (d.classificacao !== "ok" && d.classificacao !== "nao_aplicavel" && flags.length < 30) {
      flags.push(`${l.canal} ${l.providerOrderId} · ${d.classificacao} · ${d.detalhe}`);
    }
  }
  console.log(`\n════ VERIFICAÇÃO INDEPENDENTE (${dias} dias, ${linhas.length} pedidos) ════`);
  console.log(JSON.stringify(buckets, null, 2));
  if (flags.length) { console.log("\nnão fecham:"); for (const f of flags) console.log("  " + f); }
  else console.log("\n✓ tudo bate.");
}

async function fotoLedger(momento: string) {
  const linhas = await db
    .select({ status: conferenciaFinanceira.status })
    .from(conferenciaFinanceira)
    .where(eq(conferenciaFinanceira.orgId, orgId!));
  const contagem: Record<string, number> = {};
  for (const l of linhas) contagem[l.status] = (contagem[l.status] ?? 0) + 1;
  console.log(`\n── ledger ${momento}: ${linhas.length} linha(s) — ${JSON.stringify(contagem)}`);
}

const contas = await db
  .select({ id: channelAccount.id, tipo: channelAccount.tipo, marca: brand.slug })
  .from(channelAccount)
  .innerJoin(brand, and(eq(brand.id, channelAccount.brandId), eq(brand.orgId, channelAccount.orgId)))
  .where(and(
    eq(channelAccount.orgId, orgId),
    eq(channelAccount.status, "conectado"),
    inArray(channelAccount.tipo, ["mercadolivre", "shopee", "tiktokshop"]),
  ));

console.log(`Contas conectadas: ${contas.length}`);
await verificar(45);
await fotoLedger("ANTES");

const totais = { backstop: 0, candidatos: 0, rebuscas: 0, resolvidos: 0, persistentes: 0, aguardando: 0, novasPersistentes: 0 };
for (const c of contas) {
  console.log(`\n=== ${c.marca} / ${c.tipo} ===`);
  try {
    const r = await auditarPedidosDaConta(orgId, c.id, { maxRebuscas: 300 });
    console.log(JSON.stringify(r));
    for (const k of Object.keys(totais) as (keyof typeof totais)[]) totais[k] += r[k] ?? 0;
  } catch (erro) {
    console.error(`  FALHOU: ${erro instanceof Error ? erro.message : String(erro)}`);
  }
}

console.log(`\n== TOTAL ==`);
console.log(JSON.stringify(totais, null, 2));
await fotoLedger("DEPOIS");

await getDb().$client.end({ timeout: 10 });
