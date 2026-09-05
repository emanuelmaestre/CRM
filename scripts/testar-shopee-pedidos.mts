// Test authenticated order reads without printing credentials or customer data.
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);require('@next/env').loadEnvConfig(process.cwd());
const {criarShopeeProvider}=await import('../src/modules/canais/infrastructure/shopee.provider');
for(const marca of ['armarinhos_lima','wuwu'] as const){
 try{
  const p=await criarShopeeProvider(marca);
  const orders=await p.buscarPedidos(new Date('2026-09-04T03:00:00Z'),{ate:new Date()});
  console.log(JSON.stringify({marca,consulta:'ok',pedidos:orders.length}));
 }catch(e){
  let msg=e instanceof Error?e.message:'Erro desconhecido';
  for(const [k,v] of Object.entries(process.env))if(v&&v.length>8&&/TOKEN|KEY|SECRET|PASSWORD|PROXY/.test(k))msg=msg.split(v).join('[oculto]');
  console.log(JSON.stringify({marca,consulta:'falhou',erro:msg.replace(/https?:\/\/\S+/g,'[URL omitida]')}));
 }
}
process.exit(0);
