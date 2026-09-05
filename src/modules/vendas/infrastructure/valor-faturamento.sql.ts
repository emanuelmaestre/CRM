import { sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { pedido } from "@/shared/lib/db/schema";

/** A criação permanece intacta; vendas ML são reconhecidas na aprovação.
 * Payloads legados usam a criação até o enriquecimento histórico. */
export function dataVendaPedidoSql(): SQL<Date> {
  return sql<Date>`case when ${pedido.canal} = 'mercadolivre'
    and jsonb_typeof(${pedido.dadosOrigem}->'aprovadoEmMs') = 'number'
    then to_timestamp((${pedido.dadosOrigem}->>'aprovadoEmMs')::double precision / 1000)
    else ${pedido.createdAt} end`.mapWith((v: string | Date) => new Date(v));
}

export function pedidoComercialSql(): SQL<boolean> {
  return sql<boolean>`not (${pedido.canal} = 'mercadolivre'
    and coalesce(${pedido.dadosOrigem}->'cancelamento'->>'code', '') = 'pack_splitted')`;
}

/**
 * Equivalente SQL de `valorFaturavelPedido`.
 *
 * O cast só ocorre para valores JSON cujo tipo é realmente number. Arrays
 * ausentes, nulls e payloads antigos/malformados viram lista vazia e não
 * alteram o bruto.
 */
export function reembolsoParcialPedidoSql(
  dadosOrigem: SQLWrapper = pedido.dadosOrigem,
): SQL<number> {
  return sql<number>`coalesce((
    select sum(
      case
        when jsonb_typeof(pagamento->'reembolsado') = 'number'
          then greatest((pagamento->>'reembolsado')::numeric, 0)
        else 0
      end
    )
    from jsonb_array_elements(
      case
        when jsonb_typeof(${dadosOrigem}->'pagamentos') = 'array'
          then ${dadosOrigem}->'pagamentos'
        else '[]'::jsonb
      end
    ) as pagamento
  ), 0)`;
}

/**
 * Prova de que o pedido chegou a ser pago, mesmo que hoje esteja cancelado.
 *
 * Registros novos recebem `pagamentoAprovado`. Para pedidos antigos do
 * Mercado Livre, os campos financeiros já armazenados permitem reconstruir
 * a mesma decisão. Nos outros canais, payload legado sem o marcador mantém o
 * comportamento anterior até ser enriquecido por uma nova sincronização.
 */
export function pagamentoAprovadoPedidoSql(
  canal: SQLWrapper = pedido.canal,
  dadosOrigem: SQLWrapper = pedido.dadosOrigem,
): SQL<boolean> {
  const pagamentos = sql`case
    when jsonb_typeof(${dadosOrigem}->'pagamentos') = 'array'
      then ${dadosOrigem}->'pagamentos'
    else '[]'::jsonb
  end`;

  return sql<boolean>`case
    when ${dadosOrigem}->>'pagamentoAprovado' = 'true' then true
    when jsonb_typeof(${dadosOrigem}->'valorPago') = 'number'
      and (${dadosOrigem}->>'valorPago')::numeric > 0 then true
    when exists (
      select 1
      from jsonb_array_elements(${pagamentos}) as pagamento
      where lower(coalesce(pagamento->>'status', '')) in (
        'approved', 'paid', 'partially_refunded', 'refunded', 'charged_back'
      )
      or (
        jsonb_typeof(pagamento->'total') = 'number'
        and (pagamento->>'total')::numeric > 0
      )
      or (
        jsonb_typeof(pagamento->'reembolsado') = 'number'
        and (pagamento->>'reembolsado')::numeric > 0
      )
    ) then true
    when ${dadosOrigem}->>'pagamentoAprovado' = 'false' then false
    when ${canal} = 'mercadolivre' then false
    else true
  end`;
}

export function valorFaturavelPedidoSql(
  total: SQLWrapper = pedido.total,
  dadosOrigem: SQLWrapper = pedido.dadosOrigem,
): SQL<number> {
  const reembolso = reembolsoParcialPedidoSql(dadosOrigem);

  return sql<number>`greatest(${total} - ${reembolso}, 0)`;
}
