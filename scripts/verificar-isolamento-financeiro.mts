import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { pagamentoAprovadoPedidoSql } from '../src/modules/vendas/infrastructure/valor-faturamento.sql';

/* Confere no próprio Postgres a regra que decide se um pedido chegou a ser
 * pago. Vale para todos os canais: a entrega isolada de Shopee/TikTok deixou
 * de existir quando a regra foi unificada. Sem evidência positiva, o marcador
 * explícito decide; na ausência dele, só o Mercado Livre presume não pago,
 * porque lá o cancelamento por falta de pagamento é o caso comum. */
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL ausente');
const conn = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
try {
  const canais = ['mercadolivre', 'shopee', 'tiktokshop', 'manual'];
  const statuses = ['criado','pago','separado','enviado','entregue','concluido','cancelado','devolvido'];
  const dados = [{}, {pagamentoAprovado:true}, {pagamentoAprovado:false}, {valorPago:19.9}];
  const values = canais.flatMap(c => statuses.flatMap(s => dados.map(d => sql`(${c}::text, ${s}::text, ${JSON.stringify(d)}::jsonb)`)));
  const query = new PgDialect().sqlToQuery(sql`select canal, status, dados_origem,
    ${pagamentoAprovadoPedidoSql(sql`pedido.canal`, sql`pedido.dados_origem`)} as pagamento_aprovado
    from (values ${sql.join(values, sql`, `)}) as pedido(canal,status,dados_origem)`);
  const rows = await conn.begin('read only', tx => tx.unsafe(query.sql, query.params as never[]));
  for (const r of rows) {
    const marcador = r.dados_origem.pagamentoAprovado;
    const esperado = Number(r.dados_origem.valorPago ?? 0) > 0 ? true
      : marcador === true ? true
      : marcador === false ? false
      : r.canal !== 'mercadolivre';
    if (r.pagamento_aprovado !== esperado) {
      throw new Error(`Divergiu: ${r.canal}/${r.status}/${JSON.stringify(r.dados_origem)} => ${r.pagamento_aprovado}, esperado ${esperado}`);
    }
  }
  console.log(JSON.stringify({somenteLeitura:true, combinacoes:rows.length, regraUnificada:true, resultado:'OK'}));
} finally { await conn.end(); }
