import {createRequire} from 'node:module';
import {sql} from 'drizzle-orm';
const require=createRequire(import.meta.url);require('@next/env').loadEnvConfig(process.cwd());
const {db}=await import('../src/shared/lib/db');
const {consultarResumoPedidos}=await import('../src/modules/vendas/infrastructure/pedidos.repository');
const org=process.env.DEFAULT_ORG_ID!;
for(const slug of ['armarinhos_lima','karzi','wuwu']){
 const [b]=await db.execute(sql`select id from brand where org_id=${org} and slug=${slug}`);
 for(const inicio of ['2026-09-04','2026-08-29','2026-08-06']){
  const s=await consultarResumoPedidos(org,{brandIds:[String(b.id)],canais:['tiktokshop'],inicio:new Date(inicio+'T00:00:00-03:00'),fim:new Date('2026-09-04T23:25:59.791Z')});
  console.log(JSON.stringify({marca:slug,inicio,bruto:s.totalBrutoComparavel,pedidos:s.totalBrutoPedidos}));
 }
 const counts=await db.execute(sql`select dados_origem->>'pagamentoAprovado' as aprovado,count(*) as quantidade,sum(total) as total from pedido where org_id=${org} and brand_id=${b.id} and canal='tiktokshop' and status='cancelado' and criado_em >= '2026-08-06T03:00:00Z'::timestamptz group by 1`);
 console.log(JSON.stringify({marca:slug,cancelados:counts}));
}
process.exit(0);
