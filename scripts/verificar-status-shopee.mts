import {createRequire} from 'node:module';import {sql} from 'drizzle-orm';
const require=createRequire(import.meta.url);require('@next/env').loadEnvConfig(process.cwd());
const {db}=await import('../src/shared/lib/db');
const rows=await db.execute(sql`select provider_order_id,status,total,dados_origem->>'status' as externo,atualizado_origem_em from pedido where org_id=${process.env.DEFAULT_ORG_ID!} and canal='shopee' and criado_em>='2026-08-06T03:00:00Z'::timestamptz and status in ('cancelado','devolvido') and lower(dados_origem->>'status') in ('completed','shipped','ready_to_ship','processed','to_confirm_receive')`);
console.log(JSON.stringify(rows));process.exit(0);
