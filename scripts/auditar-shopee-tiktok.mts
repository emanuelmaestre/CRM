// Read-only diagnostic: no ingestion, token refresh or database writes.
import {createRequire} from 'node:module';
import {sql} from 'drizzle-orm';
const require=createRequire(import.meta.url);require('@next/env').loadEnvConfig(process.cwd());
const {db}=await import('../src/shared/lib/db');
const {consultarResumoPedidos}=await import('../src/modules/vendas/infrastructure/pedidos.repository');
const {criarShopeeProvider,obterTokenShopee}=await import('../src/modules/canais/infrastructure/shopee.provider');
const {obterShopeeAppCredenciais}=await import('../src/shared/config/shopee-env');
const {criarTikTokShopProvider}=await import('../src/modules/canais/infrastructure/tiktokshop.provider');
const {mapearStatusPedido}=await import('../src/modules/canais/domain/order-status');
const {statusPedidoFaturavel}=await import('../src/modules/vendas/domain/status-faturamento');
const org=process.env.DEFAULT_ORG_ID!;
const cutoff=new Date();
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(cutoff);
const start=(n:number)=>new Date(new Date(Date.parse(`${today}T12:00:00Z`)-n*86400000).toISOString().slice(0,10)+'T00:00:00-03:00');
for(const slug of ['armarinhos_lima','karzi','wuwu'] as const){
 for(const canal of ['shopee','tiktokshop'] as const){
  if(slug==='karzi'&&canal==='shopee')continue;
  const [brand]=await db.execute(sql`select id from brand where org_id=${org} and slug=${slug}`);
  const locals=await db.execute(sql`select provider_order_id,total,status,criado_em,dados_origem from pedido where org_id=${org} and brand_id=${brand.id} and canal=${canal}`);
  const byId=new Map(locals.map(p=>[String(p.provider_order_id),p]));
  const crm=[];
  for(const n of [0,6,29]){
   const s=await consultarResumoPedidos(org,{brandIds:[String(brand.id)],canais:[canal],inicio:start(n),fim:cutoff});
   crm.push({periodo:n===0?'hoje':n+1,inicio:start(n).toISOString(),bruto:s.totalBrutoComparavel,pedidos:s.totalBrutoPedidos});
  }
  console.log(JSON.stringify({marca:slug,canal,cutoff:cutoff.toISOString(),crm}));
  try{
   const p=canal==='shopee'?await criarShopeeProvider(slug):await criarTikTokShopProvider(slug);
   const orders=await p.buscarPedidos(start(29),{ate:cutoff});
   for(const n of [0,6,29]){
    const list=orders.filter(p=>new Date(p.criadoEm)>=start(n)&&new Date(p.criadoEm)<=cutoff);
    const missing=list.filter(p=>!byId.has(p.providerOrderId));
    const differences=list.flatMap(p=>{const l=byId.get(p.providerOrderId);if(!l)return[];return Number(l.total)!==Number(p.total)||l.status!==mapearStatusPedido(p.status)?[{id:p.providerOrderId,crmTotal:l.total,apiTotal:p.total,crmStatus:l.status,apiStatus:p.status}]:[];});
    const cancels=list.filter(p=>mapearStatusPedido(p.status)==='cancelado');
    const ids=new Set(list.map(p=>p.providerOrderId));
    const extras=locals.filter(l=>new Date(String(l.criado_em))>=start(n)&&new Date(String(l.criado_em))<=cutoff&&!ids.has(String(l.provider_order_id)));
    console.log(JSON.stringify({marca:slug,canal,periodo:n===0?'hoje':n+1,apiPedidos:list.length,apiTotalTodos:list.reduce((s,p)=>s+Math.round(Number(p.total)*100),0)/100,apiFaturaveis:list.filter(p=>statusPedidoFaturavel(mapearStatusPedido(p.status))).length,apiValorFaturaveis:list.filter(p=>statusPedidoFaturavel(mapearStatusPedido(p.status))).reduce((s,p)=>s+Math.round(Number(p.total)*100),0)/100,cancelados:cancels.length,canceladosValor:cancels.reduce((s,p)=>s+Math.round(Number(p.total)*100),0)/100,canceladosMarcador:cancels.map(p=>(byId.get(p.providerOrderId)?.dados_origem as any)?.pagamentoAprovado??'ausente'),missing:missing.map(p=>({id:p.providerOrderId,total:p.total,status:p.status})),differences,extras:extras.map(p=>({id:p.provider_order_id,total:p.total,status:p.status}))}));
   }
  }catch(e){console.log(JSON.stringify({marca:slug,canal,erro:e instanceof Error?e.message:'Erro desconhecido'}));if(canal==='shopee')for(const app of ['pedidos','financeiro'] as const){const c=obterShopeeAppCredenciais(app);let token='disponivel';try{await obterTokenShopee(slug,app);}catch(e){token=(e as Error).message;}console.log(JSON.stringify({marca:slug,app,appConfigurado:!!(c.partnerId&&c.partnerKey),token}));}}
 }
}
process.exit(0);
