// Read-only reconciliation of official daily/hourly exports with order records.
import {createRequire} from 'node:module';
import {createClient} from '@supabase/supabase-js';
const require=createRequire(import.meta.url); require('@next/env').loadEnvConfig(process.cwd());
const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
const org=process.env.DEFAULT_ORG_ID;
const {data:brand,error:be}=await sb.from('brand').select('id').eq('org_id',org).eq('slug','wuwu').single();if(be)throw be;
const {data:tok,error:te}=await sb.from('canal_tokens').select('access_token').eq('org_id',org).eq('brand_id',brand.id).eq('canal','mercadolivre').single();if(te)throw te;
const headers={Authorization:`Bearer ${tok.access_token}`};
async function get(url){const r=await fetch(url,{headers});if(!r.ok)throw Error(`${r.status}: ${await r.text()}`);return r.json();}
const me=await get('https://api.mercadolibre.com/users/me');
const orders=new Map();
for(let day=27;day<=35;day++){
 const d=new Date(Date.UTC(2026,7,day)).toISOString().slice(0,10);
 for(let offset=0;;offset+=50){
  const u=new URL('https://api.mercadolibre.com/orders/search');
  for(const [k,v] of Object.entries({seller:me.id,'order.date_created.from':`${d}T00:00:00.000-03:00`,'order.date_created.to':`${d}T23:59:59.999-03:00`,limit:50,offset,sort:'date_asc'}))u.searchParams.set(k,v);
  const j=await get(u); for(const p of j.results??[])orders.set(String(p.id),p);
  if(offset+(j.results?.length??0)>=j.paging.total || !j.results?.length)break;
 }
}
const all=[...orders.values()];
const key=(date,off,len=10)=>date?new Date(Date.parse(date)+off*3600000).toISOString().slice(0,len):'';
const sum=a=>Math.round(a.reduce((s,p)=>s+Number(p.total_amount),0)*100)/100;
const stats=a=>({n:a.length,units:a.reduce((s,p)=>s+p.order_items.reduce((t,i)=>t+i.quantity,0),0),gross:sum(a),cancel:a.filter(p=>p.status==='cancelled').length,cancelValue:sum(a.filter(p=>p.status==='cancelled'))});
for(const p of all)p.approved=p.payments?.map(x=>x.date_approved).filter(Boolean).sort()[0]??null;
const crm=[];for(let offset=0;;offset+=1000){const {data,error}=await sb.from('pedido').select('provider_order_id,total,status,criado_em').eq('org_id',org).eq('brand_id',brand.id).eq('canal','mercadolivre').gte('criado_em','2026-08-27T00:00:00-03:00').lte('criado_em','2026-09-04T23:59:59-03:00').range(offset,offset+999);if(error)throw error;crm.push(...data);if(data.length<1000)break;}
const ids=new Map(crm.map(p=>[String(p.provider_order_id),p]));
console.log('CRM DAILY',JSON.stringify(Object.fromEntries([...new Set(crm.map(p=>key(p.criado_em,-3)))].sort().map(d=>{const a=crm.filter(p=>key(p.criado_em,-3)===d);return[d,{n:a.length,gross:a.reduce((s,p)=>s+Number(p.total),0)}]}))));
console.log('MISSING',JSON.stringify(all.filter(p=>key(p.date_created,-3)>='2026-08-28'&&key(p.date_created,-3)<='2026-09-04'&&!ids.has(String(p.id))).map(p=>({id:p.id,created:p.date_created,total:p.total_amount,status:p.status}))));
console.log('SHIFTED ORDERS',JSON.stringify(all.filter(p=>key(p.date_created,-3)!==key(p.date_closed,-3)).map(p=>({id:p.id,created:p.date_created,closed:p.date_closed,approved:p.approved,total:p.total_amount,inCrm:ids.has(String(p.id))}))));
const expected=[['2026-08-28',66,73,2368],['2026-08-29',74,78,2517],['2026-08-30',77,82,2766],['2026-08-31',91,105,3263],['2026-09-01',76,91,2809],['2026-09-02',66,72,2352],['2026-09-03',81,90,2779],['2026-09-04',46,51,1751]];
const eligible=all.filter(p=>p.approved&&p.cancel_detail?.code!=='pack_splitted');
let rounded=0;
for(const [day,n,u,v]of expected){const s=stats(eligible.filter(p=>key(p.approved,-3)===day));rounded+=Math.round(s.gross);if(s.n!==n||s.units!==u||Math.round(s.gross)!==v)throw Error('Daily mismatch '+day);console.log('VALIDATED DAY',day,JSON.stringify(s));}
console.log('VALIDATED PERIOD',JSON.stringify(stats(eligible.filter(p=>key(p.approved,-3)>='2026-08-28'&&key(p.approved,-3)<='2026-09-04'))),'sumRoundedDaily',rounded);
const hourly=[[2,2,71],[1,1,25],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[1,1,44],[3,3,104],[5,5,210],[5,8,259],[2,2,65],[4,4,118],[4,4,121],[1,1,25],[5,5,202],[2,2,87],[4,6,195],[5,5,174],[2,2,50],[0,0,0]];
hourly.forEach(([n,u,v],h)=>{const s=stats(eligible.filter(p=>key(p.approved,-3,13)===`2026-09-04T${String(h).padStart(2,'0')}`));if(s.n!==n||s.units!==u||Math.round(s.gross)!==v)throw Error('Hourly mismatch '+h);});
console.log('VALIDATED HOURS',hourly.length);
console.log('SPLITS',JSON.stringify(all.filter(p=>p.cancel_detail?.code==='pack_splitted').map(p=>({id:p.id,total:p.total_amount,closed:p.date_closed,cancel:p.cancel_detail}))));
console.log('CRM SHORTCUT',JSON.stringify(crm.filter(p=>key(p.criado_em,-3)>='2026-08-29').reduce((s,p)=>({n:s.n+1,gross:Math.round((s.gross+Number(p.total))*100)/100}),{n:0,gross:0})));
