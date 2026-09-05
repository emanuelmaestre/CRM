import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { pedidoFaturavelNestaEntrega, cancelamentoFinanceiroNestaEntrega } from '../src/modules/vendas/infrastructure/financeiro-shopee-tiktok.sql';
import { statusPedidoFaturavel } from '../src/modules/vendas/domain/status-faturamento';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL ausente');
const conn = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
try {
  const canais = ['mercadolivre', 'shopee', 'tiktokshop', 'manual'];
  const statuses = ['criado','pago','separado','enviado','entregue','concluido','cancelado','devolvido'];
  const dados = [{}, {pagamentoAprovado:true}, {pagamentoAprovado:false}];
  const values = canais.flatMap(c => statuses.flatMap(s => dados.map(d => sql`(${c}::text, ${s}::text, ${JSON.stringify(d)}::jsonb)`)));
  const query = new PgDialect().sqlToQuery(sql`select canal, status, dados_origem,
    ${pedidoFaturavelNestaEntrega()} as faturavel,
    ${cancelamentoFinanceiroNestaEntrega()} as cancelamento_financeiro
    from (values ${sql.join(values, sql`, `)}) as pedido(canal,status,dados_origem)`);
  const rows = await conn.begin('read only', tx => tx.unsafe(query.sql, query.params as never[]));
  for (const r of rows) {
    const alvo = r.canal === 'shopee' || r.canal === 'tiktokshop';
    const esperado = alvo ? statusPedidoFaturavel(r.status) : !['cancelado','devolvido'].includes(r.status);
    if (r.faturavel !== esperado) throw new Error('Predicado faturável divergiu');
    if (r.cancelamento_financeiro !== (!alvo || r.dados_origem.pagamentoAprovado !== false)) throw new Error('Cancelamento divergiu');
  }
  console.log(JSON.stringify({somenteLeitura:true, combinacoes:rows.length, mercadoLivrePreservado:true, resultado:'OK'}));
} finally { await conn.end(); }
