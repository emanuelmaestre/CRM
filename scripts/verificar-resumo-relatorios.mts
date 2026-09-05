import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);require('@next/env').loadEnvConfig(process.cwd());
const {db}=await import('../src/shared/lib/db');
const {sql}=await import('drizzle-orm');
const {consultarResumoPedidos,consultarPedidosDetalhados}=await import('../src/modules/vendas/infrastructure/pedidos.repository');
const org=process.env.DEFAULT_ORG_ID!;
const [brand]=await db.execute(sql`select id from brand where org_id=${org} and slug='wuwu'`);
for(const [inicio,pedidos,bruto] of [['2026-09-04',46,1750.60],['2026-08-28',577,20604.28]] as const){
 const opts={brandIds:[String(brand.id)],canais:['mercadolivre' as const],inicio:new Date(`${inicio}T00:00:00-03:00`),fim:new Date('2026-09-04T19:35:00-03:00')};
 const resumo=await consultarResumoPedidos(org,opts);
 const lista=await consultarPedidosDetalhados(org,{...opts,limit:5,offset:0});
 console.log(JSON.stringify({inicio,pedidos:resumo.totalBrutoPedidos,bruto:resumo.totalBrutoComparavel,totalLista:lista.total}));
 if(resumo.totalBrutoPedidos!==pedidos||Math.abs(resumo.totalBrutoComparavel-bruto)>0.005||lista.total!==pedidos)throw Error('Resumo diverge do relatorio');
}
process.exit(0);
