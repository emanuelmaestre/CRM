import { sql } from "drizzle-orm";
import { pedido } from "@/shared/lib/db/schema";
import { composicaoResumoPedidosSql } from "@/modules/vendas/infrastructure/composicao-resumo.sql";
import { dataVendaPedidoSql } from "@/modules/vendas/infrastructure/valor-faturamento.sql";
import { dataPagamentoShopeeSql, valorProdutosShopeeSql } from "@/modules/vendas/infrastructure/valor-shopee.sql";
import { dataPagamentoTikTokSql, pedidoGmvTikTokSql, valorGmvTikTokSql } from "@/modules/vendas/infrastructure/gmv-tiktok.sql";

/** Mesmas referências dos cards individuais de Vendas, inclusive em seleção mista. */
export function referenciaFaturamentoSql() {
  const composicao = composicaoResumoPedidosSql();
  const data = sql<Date>`case when ${pedido.canal} = 'shopee' then ${dataPagamentoShopeeSql()}
    when ${pedido.canal} = 'tiktokshop' then ${dataPagamentoTikTokSql()}
    else ${dataVendaPedidoSql()} end`.mapWith((v: string | Date) => new Date(v));
  const incluido = sql<boolean>`case when ${pedido.canal} = 'shopee' then ${dataPagamentoShopeeSql()} is not null
    when ${pedido.canal} = 'tiktokshop' then ${pedidoGmvTikTokSql()}
    else ${composicao.bruto} end`;
  const bruto = sql<number>`case when ${pedido.canal} = 'shopee' then ${valorProdutosShopeeSql()}
    when ${pedido.canal} = 'tiktokshop' then ${valorGmvTikTokSql()}
    else ${composicao.valorBruto} end`;
  return { data, incluido, bruto, original: composicao.valorOriginal, confirmado: composicao.valorConfirmado,
    faturavel: sql<boolean>`${composicao.faturavel}` };
}
