// Existing TikTok orders only; historical ingestion disables operational events.
import {createRequire} from 'node:module';
import {sql} from 'drizzle-orm';
const require=createRequire(import.meta.url);require('@next/env').loadEnvConfig(process.cwd());
const {db}=await import('../src/shared/lib/db');
const {criarTikTokShopProvider}=await import('../src/modules/canais/infrastructure/tiktokshop.provider');
const {ingerirPedido}=await import('../src/modules/canais/application/ingestao-pedido.service');
const {mapearStatusPedido}=await import('../src/modules/canais/domain/order-status');
const org=process.env.DEFAULT_ORG_ID!;
const apply=process.argv.includes('--apply');
for(const slug of ['armarinhos_lima','karzi','wuwu'] as const){
 const [brand]=await db.execute(sql`select id from brand where org_id=${org} and slug=${slug}`);
 const locals=await db.execute(sql`select id,provider_order_id,channel_account_id,status,total,dados_origem from pedido where org_id=${org} and brand_id=${brand.id} and canal='tiktokshop' and criado_em >= '2026-08-06T03:00:00Z'::timestamptz and criado_em <= '2026-09-05T03:00:00Z'::timestamptz`);
 const byId=new Map(locals.map(p=>[String(p.provider_order_id),p]));
 const provider=await criarTikTokShopProvider(slug);
 const orders=await provider.buscarPedidosPorIds([...byId.keys()]);
 let applied=0;const unknown=[];const changes=[];
 for(const p of orders){
  const l=byId.get(p.providerOrderId)!;
  const status=mapearStatusPedido(p.status);
  const semPagamentoExplicito=status==='cancelado'&&p.dadosOrigem?.motivoCancelamento==='Pagamento atrasado por parte do cliente';
  if((status==='cancelado'||status==='devolvido')&&!p.dadosOrigem?.pagamentoAprovado&&!semPagamentoExplicito){unknown.push({id:p.providerOrderId,total:p.total,motivo:p.dadosOrigem?.motivoCancelamento});continue;}
  if(Number(l.total)!==Number(p.total))throw Error(`Valor mudou em ${p.providerOrderId}; revisar antes de aplicar.`);
  if(l.status!==status)changes.push({id:p.providerOrderId,de:l.status,para:status,total:p.total});
  if(apply){await ingerirPedido(org,String(brand.id),String(l.channel_account_id),p,{historico:true});applied++;}
 }
 console.log(JSON.stringify({marca:slug,apply,pedidos:orders.length,applied,changes,canceladosSemProva:unknown}));
}
process.exit(0);
