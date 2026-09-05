// Enrich existing orders only. No inventory, amount, status or creation-date writes.
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
import { sql } from 'drizzle-orm';
import { aprovacaoMercadoLivre } from '../src/modules/vendas/domain/reconhecimento-mercadolivre';
const require = createRequire(import.meta.url);
require('@next/env').loadEnvConfig(process.cwd());
const { db } = await import('../src/shared/lib/db');
const org = process.env.DEFAULT_ORG_ID!;
const slug = process.argv[2];
if (!slug) throw Error('Informe a marca. Use --apply para persistir os metadados.');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const { data: brand, error } = await sb.from('brand').select('id').eq('org_id',org).eq('slug',slug).single();
if(error)throw error;
const {data:token,error:te}=await sb.from('canal_tokens').select('access_token').eq('org_id',org).eq('brand_id',brand.id).eq('canal','mercadolivre').single();
if(te)throw te;
const headers={Authorization:`Bearer ${token.access_token}`};
async function get(url: string | URL){const r=await fetch(url,{headers});if(!r.ok)throw Error(`ML ${r.status}`);return r.json();}
const seller=await get('https://api.mercadolibre.com/users/me');
const existentes=await db.execute(sql`select provider_order_id, criado_em, dados_origem->'aprovadoEmMs' as aprovado
 from pedido where org_id=${org} and brand_id=${brand.id} and canal='mercadolivre'
 and not coalesce(dados_origem ? 'aprovadoEmMs',false)`);
const ids=new Set(existentes.map(p=>String(p.provider_order_id)));
const primeira=Math.min(...existentes.map(p=>new Date(String(p.criado_em)).getTime()));
if(!Number.isFinite(primeira)){console.log('Nenhum pedido pendente de enriquecimento');process.exit(0);}
const agora=new Date();
const encontrados=new Map<string, {id:string; patch:{aprovadoEmMs:number|null}}>();
for(let d=new Date(new Date(primeira-86400000).toISOString().slice(0,10)+'T00:00:00Z');d<=agora;d=new Date(d.getTime()+86400000)){
 const dia=d.toISOString().slice(0,10);
 for(let offset=0;;offset+=50){
  const u=new URL('https://api.mercadolibre.com/orders/search');
  Object.entries({seller:seller.id,'order.date_created.from':`${dia}T00:00:00-03:00`,'order.date_created.to':`${dia}T23:59:59.999-03:00`,limit:50,offset,sort:'date_asc'}).forEach(([k,v])=>u.searchParams.set(k,String(v)));
  const j=await get(u);if(!Array.isArray(j.results)||!Number.isFinite(j.paging?.total))throw Error('Resposta incompleta');
  for(const p of j.results){const id=String(p.id);if(ids.has(id))encontrados.set(id,{id,patch:{aprovadoEmMs:aprovacaoMercadoLivre(p)}});}
  if(offset+j.results.length>=j.paging.total)break;
  if(!j.results.length)throw Error('Paginacao incompleta');
 }
 if(d.getUTCDate()%10===0)console.log(dia,encontrados.size,'pedidos localizados');
}
const faltam=[...ids].filter(id=>!encontrados.has(id));
console.log(JSON.stringify({marca:slug,existentes:ids.size,localizados:encontrados.size,semResposta:faltam.length,aprovados:[...encontrados.values()].filter(p=>p.patch.aprovadoEmMs!==null).length}));
console.log('Sem resposta por mes',JSON.stringify(existentes.filter(p=>faltam.includes(String(p.provider_order_id))).reduce((s:Record<string,number>,p)=>{const mes=new Date(String(p.criado_em)).toISOString().slice(0,7);s[mes]=(s[mes]??0)+1;return s;},{})));
if(process.argv.includes('--apply')){
 const result=await db.execute(sql`update pedido p set dados_origem=coalesce(p.dados_origem,'{}'::jsonb)||r.patch
 from jsonb_to_recordset(${JSON.stringify([...encontrados.values()])}::jsonb) as r(id text,patch jsonb)
 where p.org_id=${org} and p.brand_id=${brand.id} and p.canal='mercadolivre' and p.provider_order_id=r.id
 and p.dados_origem->'aprovadoEmMs' is distinct from r.patch->'aprovadoEmMs'
 returning p.id`);
 console.log('Metadados de aprovacao preenchidos:',result.length);
}
process.exit(0);
