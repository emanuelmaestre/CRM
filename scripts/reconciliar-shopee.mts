import {createRequire} from 'node:module';
import {sql} from 'drizzle-orm';
const require=createRequire(import.meta.url);require('@next/env').loadEnvConfig(process.cwd());
const {db}=await import('../src/shared/lib/db');
const {criarShopeeProvider}=await import('../src/modules/canais/infrastructure/shopee.provider');
const {ingerirPedido}=await import('../src/modules/canais/application/ingestao-pedido.service');
const {consultarResumoPedidos}=await import('../src/modules/vendas/infrastructure/pedidos.repository');
const {mapearStatusPedido}=await import('../src/modules/canais/domain/order-status');
const {statusPedidoFaturavel}=await import('../src/modules/vendas/domain/status-faturamento');
const apply=process.argv.includes('--apply');
const org=process.env.DEFAULT_ORG_ID!;const cutoff=new Date();
const starts=['2026-09-04','2026-08-29','2026-08-06'];
for(const marca of ['armarinhos_lima','wuwu'] as const){
 const [b]=await db.execute(sql`select id from brand where org_id=${org} and slug=${marca}`);
 const [account]=await db.execute(sql`select id from channel_account where org_id=${org} and brand_id=${b.id} and tipo='shopee'`);
 if(!account)throw Error('Conta Shopee ausente');
 const p=await criarShopeeProvider(marca);
 const orders=await p.buscarPedidos(new Date(starts[2]+'T00:00:00-03:00'),{ate:cutoff});
 const read=()=>db.execute(sql`select provider_order_id,status,total,criado_em,dados_origem from pedido where org_id=${org} and brand_id=${b.id} and canal='shopee'`);
 const locals=await read();const byId=new Map(locals.map(l=>[String(l.provider_order_id),l]));
 console.log(JSON.stringify({marca,apply,cutoff,apiPedidos:orders.length,ausentes:orders.filter(o=>!byId.has(o.providerOrderId)).length,valoresDiferentes:orders.filter(o=>byId.has(o.providerOrderId)&&Number(byId.get(o.providerOrderId)!.total)!==Number(o.total)).length,statusDiferentes:orders.filter(o=>byId.has(o.providerOrderId)&&byId.get(o.providerOrderId)!.status!==mapearStatusPedido(o.status)).length}));
 let applied=0;const pendentes=[];const falhas=[];
 if(apply)for(const o of orders){
  const status=mapearStatusPedido(o.status);
  if((status==='cancelado'||status==='devolvido')&&!o.dadosOrigem?.pagamentoAprovado&&o.dadosOrigem?.motivoCancelamento!=='Unpaid Order'){pendentes.push({id:o.providerOrderId,status,total:o.total});continue;}
  try{await ingerirPedido(org,String(b.id),String(account.id),o,{historico:true});applied++;}
  catch(e){falhas.push({id:o.providerOrderId,erro:(e as Error).message.replace(/https?:\/\/\S+/g,'[URL]')});}
  if(applied%50===0)console.log(JSON.stringify({marca,progresso:applied}));
 }
 const after=await read();const afterIds=new Map(after.map(l=>[String(l.provider_order_id),l]));
 for(const inicio of starts){
  const start=new Date(inicio+'T00:00:00-03:00');
  const list=orders.filter(o=>o.criadoEm>=start&&o.criadoEm<=cutoff);
  const valid=list.filter(o=>statusPedidoFaturavel(mapearStatusPedido(o.status)));
  const crm=await consultarResumoPedidos(org,{brandIds:[String(b.id)],canais:['shopee'],inicio:start,fim:cutoff});
  const api=valid.reduce((s,o)=>s+Math.round(Number(o.total)*100),0)/100;
  console.log(JSON.stringify({marca,inicio,cutoff,apiFaturamento:api,apiFaturaveis:valid.length,crmFaturamento:crm.faturamento,crmBruto:crm.totalBrutoComparavel,crmFaturaveis:crm.totalPedidos,diferenca:Math.round((api-crm.faturamento)*100)/100,canceladosSemValidacao:list.filter(o=>['cancelado','devolvido'].includes(mapearStatusPedido(o.status))).length,ausentes:valid.filter(o=>!afterIds.has(o.providerOrderId)).length,statusDiferentes:valid.filter(o=>afterIds.get(o.providerOrderId)?.status!==mapearStatusPedido(o.status)).length,valoresDiferentes:valid.filter(o=>Number(afterIds.get(o.providerOrderId)?.total)!==Number(o.total)).length}));
 }
 console.log(JSON.stringify({marca,applied,pendentes,falhas}));
}
process.exit(0);
