import { inArray, sql } from "drizzle-orm";
import { pedido } from "@/shared/lib/db/schema";
import { MAPA_STATUS_PEDIDO, type PedidoStatus } from "@/modules/canais/domain/order-status";
import { STATUS_PEDIDO_FATURAVEL } from "../domain/status-faturamento";
import { pagamentoAprovadoPedidoSql, reembolsoParcialPedidoSql, valorFaturavelPedidoSql } from "./valor-faturamento.sql";
import { valorProdutosShopeeSql } from "./valor-shopee.sql";

/** A listagem de pedidos Shopee/TikTok inclui checkouts não pagos. Isso não
 * transforma o valor desses pedidos em receita confirmada. O recorte de
 * vendas aprovadas do Mercado Livre permanece restrito ao próprio canal. */
export function composicaoResumoPedidosSql() {
  const todosOsPedidos = inArray(pedido.canal, ["shopee", "tiktokshop"]);
  const externo = sql`lower(btrim(coalesce(${pedido.dadosOrigem}->>'status', '')))`;
  // O estágio operacional pode ter avançado localmente (ex.: Entregue) após
  // a API informar TO_RETURN. Os cards seguem a fotografia do canal quando
  // disponível; payload legado sem status continua usando o estado local.
  const statusCanal = sql<PedidoStatus>`case when ${todosOsPedidos} and ${externo} <> ''
    then case ${externo}
      ${sql.join(Object.entries(MAPA_STATUS_PEDIDO).map(([origem, destino]) => sql`when ${origem} then ${destino}`), sql` `)}
      else 'criado' end
    else ${pedido.status}::text end`;
  // O TikTok mantém COMPLETED mesmo depois de devolver todo o pagamento.
  // Ajuste só financeiro: não regride a etapa operacional nem altera o ML.
  const status = sql<PedidoStatus>`case when ${todosOsPedidos}
    and ${statusCanal} in (${sql.join(STATUS_PEDIDO_FATURAVEL.map((s) => sql`${s}`), sql`, `)})
    and ${pedido.total} > 0 and ${reembolsoParcialPedidoSql()} >= ${pedido.total}
    then 'devolvido' else ${statusCanal} end`;
  const faturavel = inArray(status, [...STATUS_PEDIDO_FATURAVEL]);
  const ajuste = sql`(${todosOsPedidos} or ${pagamentoAprovadoPedidoSql()})`;
  const cancelado = sql`${status} = 'cancelado' and ${ajuste}`;
  const devolvido = sql`${status} = 'devolvido' and ${ajuste}`;
  const bruto = sql`(${todosOsPedidos} or ${faturavel} or (${cancelado}) or (${devolvido}))`;
  // Complemento explícito: até status novo conservado como "criado" aparece
  // na composição, sem ser promovido a faturamento por uma lista negativa.
  const pendente = sql`${todosOsPedidos} and not (${faturavel} or ${status} in ('cancelado', 'devolvido'))`;
  // Os relatórios oficiais TikTok incluem handling_fee em Order Amount.
  // A Olist pode usar outra base; não retirar acréscimos para igualá-la.
  const valorOriginal = valorProdutosShopeeSql();
  const valorConfirmado = valorFaturavelPedidoSql(valorOriginal);
  const valorBruto = sql`case when ${todosOsPedidos} then ${valorOriginal}
    when ${faturavel} then ${valorFaturavelPedidoSql()} + ${reembolsoParcialPedidoSql()}
    else ${pedido.total} end`;
  return { status, faturavel, cancelado, devolvido, bruto, pendente, valorBruto, valorOriginal, valorConfirmado };
}
