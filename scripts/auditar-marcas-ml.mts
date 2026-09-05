// Read-only: compare the live CRM repository with creation/closure API searches.
import {createRequire} from 'node:module';
import {writeFile,mkdir} from 'node:fs/promises';
import {sql} from 'drizzle-orm';
import {createClient} from '@supabase/supabase-js';
import {aprovacaoMercadoLivre} from '../src/modules/vendas/domain/reconhecimento-mercadolivre';
const require=createRequire(import.meta.url);require('@next/env').loadEnvConfig(process.cwd());
const {db}=await import('../src/shared/lib/db');
const {consultarResumoPedidos}=await import('../src/modules/vendas/infrastructure/pedidos.repository');
const org=process.env.DEFAULT_ORG_ID!;
const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!);
const cutoff=new Date();
const hoje=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(cutoff);
const diaAtras=(n:number)=>new Date(Date.parse(`${hoje}T12:00:00Z`)-n*86400000).toISOString().slice(0,10);
type OrderML={id:string|number;total_amount:number;status?:string;order_items:Array<{quantity:number}>;payments?:Array<{date_approved?:string|null}>;cancel_detail?:{code?:string;group?:string}|null};
type DadosOrigemML={aprovadoEmMs?:unknown;pagamentoAprovado?:unknown;valorPago?:unknown;cancelamento?:{code?:string}}|null;
const resultados=[];
for(const slug of process.argv.slice(2)){
 const [brand]=await db.execute(sql`select id from brand where org_id=${org} and slug=${slug}`);
 if(!brand)throw Error('Marca desconhecida');
 const {data:token,error}=await sb.from('canal_tokens').select('access_token').eq('org_id',org).eq('brand_id',brand.id).eq('canal','mercadolivre').single();if(error)throw error;
 const headers={Authorization:`Bearer ${token.access_token}`};
 async function get(u:string|URL){for(let attempt=0;attempt<5;attempt++){const r=await fetch(u,{headers});if(r.ok)return r.json();if(r.status===429||r.status>=500){await new Promise(resolve=>setTimeout(resolve,Math.min(15000,Math.max(2000*2**attempt,Number(r.headers.get('retry-after')??0)*1000))));continue;}throw Error(`${slug}: HTTP ${r.status}`);}throw Error(`${slug}: limite da API persistente`);}
 const seller=await get('https://api.mercadolibre.com/users/me');
 const orders=new Map<string,OrderML>();
 for(const field of ['date_created','date_closed']){
  for(let n=30;n>=0;n--){
   const dia=diaAtras(n);
   for(let offset=0;;offset+=50){
    const u=new URL('https://api.mercadolibre.com/orders/search');
    Object.entries({seller:seller.id,[`order.${field}.from`]:`${dia}T00:00:00-03:00`,[`order.${field}.to`]:`${dia}T23:59:59.999-03:00`,limit:50,offset,sort:'date_asc'}).forEach(([k,v])=>u.searchParams.set(k,String(v)));
    const j=await get(u);if(!Array.isArray(j.results)||!Number.isFinite(j.paging?.total))throw Error('Resposta incompleta');
    for(const p of j.results){
     const ts=Date.parse(p[field]);
     // Search can include the adjacent boundary hour; dedup and exact
     // approval filtering below determine membership, never the API slice.
     if(!Number.isFinite(ts)||ts<Date.parse(`${dia}T00:00:00-03:00`)-3600000||ts>Date.parse(`${dia}T23:59:59.999-03:00`)+3600000)throw Error(`Filtro ${field} não respeitado: ${dia} ${p[field]}`);
     orders.set(String(p.id),p);
    }
    if(offset+j.results.length>=j.paging.total)break;
    if(!j.results.length||offset>=9950)throw Error('Paginacao incompleta');
   }
  }
  console.log(slug,field,orders.size,'pedidos');
 }
 const locals=await db.execute(sql`select provider_order_id,total,status,criado_em,dados_origem from pedido where org_id=${org} and brand_id=${brand.id} and canal='mercadolivre'`);
 const byId=new Map(locals.map(p=>[String(p.provider_order_id),p]));
 const rows=[];
 for(const n of [0,7,30]){
  const inicio=new Date(`${diaAtras(n)}T00:00:00-03:00`);
  const crm=await consultarResumoPedidos(org,{brandIds:[String(brand.id)],canais:['mercadolivre'],inicio,fim:cutoff});
  const official=[...orders.values()].filter(p=>{const a=aprovacaoMercadoLivre(p);return a!==null&&a>=inicio.getTime()&&a<=cutoff.getTime()&&p.cancel_detail?.code!=='pack_splitted';});
  const gross=official.reduce((s,p)=>s+Math.round(Number(p.total_amount)*100),0)/100;
  const officialIds=new Set(official.map(p=>String(p.id)));
  const missing=official.filter(p=>!byId.has(String(p.id))).map(p=>({id:String(p.id),total:p.total_amount,aprovadoEm:aprovacaoMercadoLivre(p)}));
  const wrongDates=official.flatMap(p=>{const l=byId.get(String(p.id));if(!l)return[];const d=l.dados_origem as DadosOrigemML;const t=typeof d?.aprovadoEmMs==='number'?d.aprovadoEmMs:Date.parse(String(l.criado_em));return t<inicio.getTime()||t>cutoff.getTime()?[{id:String(p.id),total:p.total_amount,criacao:l.criado_em,aprovacao:aprovacaoMercadoLivre(p)}]:[];});
  const valueDiff=official.flatMap(p=>{const l=byId.get(String(p.id));return l&&Math.round(Number(l.total)*100)!==Math.round(Number(p.total_amount)*100)?[{id:String(p.id),crm:l.total,api:p.total_amount}]:[];});
  const extras=locals.filter(l=>{const d=l.dados_origem as DadosOrigemML;const t=typeof d?.aprovadoEmMs==='number'?d.aprovadoEmMs:Date.parse(String(l.criado_em));return t>=inicio.getTime()&&t<=cutoff.getTime()&&d?.cancelamento?.code!=='pack_splitted'&&(l.status==='pago'||d?.pagamentoAprovado||Number(d?.valorPago)>0)&&!officialIds.has(String(l.provider_order_id));}).map(l=>({id:l.provider_order_id,total:l.total,status:l.status}));
  const row={periodo:n||'hoje',inicio:diaAtras(n),fim:cutoff.toISOString(),crm:{bruto:crm.totalBrutoComparavel,pedidos:crm.totalBrutoPedidos},api:{bruto:gross,pedidos:official.length,unidades:official.reduce((s,p)=>s+p.order_items.reduce((v:number,i:{quantity:number})=>v+i.quantity,0),0)},diferenca:Math.round((gross-crm.totalBrutoComparavel)*100)/100,missing,wrongDates,valueDiff,extras,semDataAprovacao:official.filter(p=>{const l=byId.get(String(p.id));return l&&typeof (l.dados_origem as DadosOrigemML)?.aprovadoEmMs!=='number';}).length};
  rows.push(row);
  console.log(JSON.stringify({...row,missing:missing.length,wrongDates:wrongDates.length,valueDiff:valueDiff.length,extras:extras.length}));
 }
 resultados.push({marca:slug,seller:seller.nickname,sellerId:seller.id,rows});
}
await mkdir('outputs/auditoria-marcas-ml',{recursive:true});
await writeFile(`outputs/auditoria-marcas-ml/conferencia-${process.argv.slice(2).join('-')}.json`,JSON.stringify(resultados,null,2));
process.exit(0);
