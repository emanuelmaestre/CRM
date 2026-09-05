import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);require('@next/env').loadEnvConfig(process.cwd());
const {criarTikTokShopProvider}=await import('../src/modules/canais/infrastructure/tiktokshop.provider');
const p=await criarTikTokShopProvider('wuwu');
const data=await (p as any).request('/order/202309/orders',{query:{ids:'585879432666907856,585777470352033313'}});
for(const o of data.orders??[]) console.log(JSON.stringify({id:o.id,keys:Object.keys(o),status:o.status,times:Object.fromEntries(Object.entries(o).filter(([k])=>k.endsWith('_time'))),paymentKeys:Object.keys(o.payment??{}),cancelReason:o.cancel_reason}));
const {obterShopeeAppCredenciais,shopeeAppEnvSuffix}=await import('../src/shared/config/shopee-env');
console.log(JSON.stringify({shopeeEnv:shopeeAppEnvSuffix(),credentials:Object.fromEntries(['LIVE','TEST'].map(e=>[e,{id:!!process.env[`SHOPEE_PARTNER_ID_PEDIDOS_${e}`],key:!!process.env[`SHOPEE_PARTNER_KEY_PEDIDOS_${e}`]}]))}));
process.exit(0);
