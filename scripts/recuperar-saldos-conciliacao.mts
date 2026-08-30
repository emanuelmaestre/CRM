/** Relê estoques publicados na Shopee. --apply grava apenas o cache do CRM.
 * Nunca chama sincronizarEstoque nem altera o estoque no marketplace.
 * node --env-file=.env --env-file=.env.local --import tsx scripts/recuperar-saldos-conciliacao.mts [--apply]
 */
import fs from "node:fs";
import { sql } from "drizzle-orm";
import { db, getDb } from "../src/shared/lib/db/index";
import { criarShopeeProvider } from "../src/modules/canais/infrastructure/shopee.provider";
import { isBrandSlug } from "../src/shared/config/brands";
const orgId = process.env.DEFAULT_ORG_ID;
if (!orgId) throw new Error("DEFAULT_ORG_ID obrigatório.");
const aplicar = process.argv.includes("--apply");
type Vinculo = { id: string; produto: string; conta: string; marca: string; listingId: string; skuId: string | null; warehouseId: string | null; antes: number | null };
const vinculos = await db.execute(sql`select pc.id, pc.produto_id as produto, c.id as conta, b.slug as marca,
  pc.external_listing_id as "listingId", pc.external_sku_id as "skuId", pc.external_warehouse_id as "warehouseId", s.saldo as antes
  from produto_canal pc join channel_account c on c.id = pc.channel_account_id and c.org_id = pc.org_id
  join brand b on b.id = c.brand_id and b.org_id = c.org_id
  left join estoque_canal_saldo s on s.produto_canal_id = pc.id and s.org_id = pc.org_id
  where pc.org_id = ${orgId} and pc.ativo and c.status = 'conectado' and c.tipo = 'shopee'
  order by b.slug, pc.id`) as unknown as Vinculo[];
const providers = new Map<string, Awaited<ReturnType<typeof criarShopeeProvider>>>();
const resultados: Record<string, unknown>[] = [];
const arquivo = `docs/conciliacao-saldos-${aplicar ? "aplicada" : "previa"}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
for (const v of vinculos) {
  try {
    if (!isBrandSlug(v.marca)) throw new Error("Marca inválida.");
    let provider = providers.get(v.conta);
    if (!provider) { provider = await criarShopeeProvider(v.marca); providers.set(v.conta, provider); }
    const depois = await provider.consultarEstoque(v);
    if (!Number.isSafeInteger(depois) || depois < 0) throw new Error("Saldo inválido retornado pelo canal.");
    const verificadoEm = new Date().toISOString();
    if (aplicar) await db.execute(sql`insert into estoque_canal_saldo (org_id,produto_id,channel_account_id,produto_canal_id,saldo,verificado_em)
      values (${orgId},${v.produto},${v.conta},${v.id},${depois},${verificadoEm})
      on conflict (produto_canal_id) do update set saldo = excluded.saldo, verificado_em = excluded.verificado_em
      where estoque_canal_saldo.org_id = ${orgId}`);
    resultados.push({ marca: v.marca, vinculo: v.id, listingId: v.listingId, variationId: v.warehouseId, antes: v.antes, depois, verificadoEm });
  } catch (error) {
    resultados.push({ marca: v.marca, vinculo: v.id, listingId: v.listingId, erro: error instanceof Error ? error.message.slice(0, 240) : "Falha de leitura" });
  }
  fs.writeFileSync(arquivo, JSON.stringify({ aplicar, total: vinculos.length, resultados }, null, 2));
  if (resultados.length % 25 === 0) console.log(JSON.stringify({ lidos: resultados.length, total: vinculos.length, falhas: resultados.filter((r) => r.erro).length }));
}
console.log(JSON.stringify({ arquivo, lidos: resultados.length, alterados: resultados.filter((r) => !r.erro && r.antes !== r.depois).length, falhas: resultados.filter((r) => r.erro).length }));
if (aplicar) for (const conta of new Set(vinculos.map((v) => v.conta))) {
  const ids = new Set(vinculos.filter((v) => v.conta === conta).map((v) => v.id));
  const falhas = resultados.filter((r) => ids.has(String(r.vinculo)) && r.erro).map((r) => ({ listingId: r.listingId, erro: r.erro }));
  await db.execute(sql`update channel_account set meta=jsonb_set(coalesce(meta,'{}'::jsonb),'{estoquePendencias}',${JSON.stringify(falhas)}::jsonb)
    where id=${conta} and org_id=${orgId}`);
}
await getDb().$client.end({ timeout: 10 });
