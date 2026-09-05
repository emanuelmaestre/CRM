// Narrow repair of three audited Shopee records. No operational events.
import {createRequire} from 'node:module';import {sql} from 'drizzle-orm';
const require=createRequire(import.meta.url);require('@next/env').loadEnvConfig(process.cwd());
const {db}=await import('../src/shared/lib/db');
const {criarShopeeProvider}=await import('../src/modules/canais/infrastructure/shopee.provider');
const p=await criarShopeeProvider('wuwu');const org=process.env.DEFAULT_ORG_ID!;
const [b]=await db.execute(sql`select id from brand where org_id=${org} and slug='wuwu'`);
for(const id of ['2608125CVPVBK4','2608112PK0RXKV','2608112N4RMMGK']){
 const api=await p.buscarPedidoPorId(id);
 if(api.status!=='completed'||!api.dadosOrigem?.pagamentoAprovado||!api.atualizadoOrigemEm)throw Error('API não confirma a correção');
 await db.transaction(async tx=>{
  const [l]=await tx.execute(sql`select id,status,total,atualizado_origem_em from pedido where org_id=${org} and brand_id=${b.id} and canal='shopee' and provider_order_id=${id} for update`);
  if(l.status==='concluido')return;
  if(l.status!=='devolvido'||Number(l.total)!==Number(api.total)||new Date(String(l.atualizado_origem_em)).getTime()>api.atualizadoOrigemEm!.getTime())throw Error('Registro mudou; revisar');
  await tx.execute(sql`update pedido set status='concluido',atualizado_em=now() where id=${l.id} and org_id=${org} and canal='shopee'`);
  await tx.execute(sql`insert into audit_log(org_id,brand_id,autor_tipo,entidade,entidade_id,acao,antes,depois) values(${org},${b.id},'sistema','pedido',${l.id},'reconciliacao_shopee_status',${JSON.stringify({status:l.status,total:l.total})}::jsonb,${JSON.stringify({status:'concluido',origem:'Shopee get_order_detail',statusExterno:api.status,versao:api.atualizadoOrigemEm,efeitosOperacionais:false})}::jsonb)`);
 });
 console.log(JSON.stringify({id,status:'concluido',verificadoNaApi:true}));
}
const {consultarResumoPedidos}=await import('../src/modules/vendas/infrastructure/pedidos.repository');
for(const inicio of ['2026-09-04','2026-08-29','2026-08-06']){const s=await consultarResumoPedidos(org,{brandIds:[String(b.id)],canais:['shopee'],inicio:new Date(inicio+'T00:00:00-03:00'),fim:new Date('2026-09-04T23:48:54.938Z')});console.log(JSON.stringify({inicio,faturamento:s.faturamento,bruto:s.totalBrutoComparavel,pedidos:s.totalPedidos}));}
process.exit(0);
