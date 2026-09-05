import {createRequire} from 'node:module';import {sql} from 'drizzle-orm';
const require=createRequire(import.meta.url);require('@next/env').loadEnvConfig(process.cwd());
const {db}=await import('../src/shared/lib/db');
const {criarShopeeProvider}=await import('../src/modules/canais/infrastructure/shopee.provider');
const {criarTikTokShopProvider}=await import('../src/modules/canais/infrastructure/tiktokshop.provider');
const org=process.env.DEFAULT_ORG_ID!;
const jobs=await db.execute(sql`select nome,status,count(*) as quantidade,max(iniciado_em) as ultimo_inicio,max(finalizado_em) as ultimo_fim from job_run where org_id=${org} and nome in ('A24-poll-pedidos','A31-sincronizar-conta','A34-reconciliar-pedidos') and iniciado_em>now()-interval '48 hours' group by nome,status`);
console.log(JSON.stringify({jobs}));
const candidates=await db.execute(sql`select b.slug,p.provider_order_id,p.canal,p.total from pedido p join brand b on b.id=p.brand_id where p.org_id=${org} and p.canal in ('shopee','tiktokshop') and p.status='cancelado' and p.criado_em>='2026-08-06T03:00:00Z'::timestamptz and p.dados_origem->>'pagamentoAprovado' is null`);
for(const marca of ['armarinhos_lima','karzi','wuwu'] as const)for(const canal of ['shopee','tiktokshop']){
 const list=candidates.filter(c=>c.slug===marca&&c.canal===canal);if(!list.length)continue;
 const provider=canal==='shopee'?await criarShopeeProvider(marca):await criarTikTokShopProvider(marca);
 for(const row of list){
  const p=canal==='shopee'?await (provider as Awaited<ReturnType<typeof criarShopeeProvider>>).buscarPedidoPorId(String(row.provider_order_id)):(await (provider as Awaited<ReturnType<typeof criarTikTokShopProvider>>).buscarPedidosPorIds([String(row.provider_order_id)]))[0];
  console.log(JSON.stringify({marca,canal,id:p.providerOrderId,status:p.status,total:p.total,pagamentoAprovado:p.dadosOrigem?.pagamentoAprovado??null,motivo:p.dadosOrigem?.motivoCancelamento??null}));
 }
}
process.exit(0);
