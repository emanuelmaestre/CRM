import {createRequire} from 'node:module';import {sql} from 'drizzle-orm';
const require=createRequire(import.meta.url);require('@next/env').loadEnvConfig(process.cwd());
const {db}=await import('../src/shared/lib/db');
const {criarShopeeProvider}=await import('../src/modules/canais/infrastructure/shopee.provider');
const {shopeeFetch}=await import('../src/shared/lib/shopee-proxy');
const p=await criarShopeeProvider('wuwu');
const rows=await db.execute(sql`select provider_order_id from pedido where org_id=${process.env.DEFAULT_ORG_ID!} and canal='shopee' and criado_em>='2026-08-06T03:00:00Z'::timestamptz and brand_id=(select id from brand where org_id=${process.env.DEFAULT_ORG_ID!} and slug='wuwu') order by status='cancelado' desc limit 50`);
const r=await shopeeFetch((p as unknown as {urlPedidos(rota:string,query:Record<string,string>):string}).urlPedidos('/order/get_order_detail',{order_sn_list:rows.map(r=>r.provider_order_id).join(','),response_optional_fields:'pay_time,cancel_reason,total_amount'}));
const j=await r.json();console.log(JSON.stringify({http:r.status,error:j.error,orders:j.response?.order_list?.map((o:{order_sn:string;order_status:string;pay_time?:number;cancel_reason?:string})=>({id:o.order_sn,status:o.order_status,pay_time:o.pay_time,cancel_reason:o.cancel_reason,keys:Object.keys(o)}))}));process.exit(0);
