import { sql } from "drizzle-orm";
import { db } from "@/shared/lib/db";

/** Incorpora a quarentena antiga à fila operacional sem duplicar nem apagar. */
export async function incorporarQuarentenaPedidos(orgId: string): Promise<number> {
  const linhas = await db.execute(sql`
    insert into pedido_ignorado (org_id, brand_id, channel_account_id, provider_order_id, causa, motivo, payload)
    select distinct on (l.channel_account_id, i.provider_record_id)
      i.org_id, l.brand_id, l.channel_account_id, i.provider_record_id,
      'sku_sem_produto'::pedido_ignorado_causa,
      'Importação histórica pendente. Reconsultar o pedido e conferir o vínculo com o anúncio.', i.payload
    from import_item i join import_lote l on l.id = i.lote_id and l.org_id = i.org_id
    where i.org_id = ${orgId} and i.status in ('quarentena', 'erro')
      and l.tipo = 'pedidos_historicos_mercadolivre'
      and l.brand_id is not null and l.channel_account_id is not null
      and not exists (select 1 from pedido p where p.org_id = i.org_id
        and p.channel_account_id = l.channel_account_id and p.provider_order_id = i.provider_record_id)
    order by l.channel_account_id, i.provider_record_id, i.atualizado_em desc
    on conflict (channel_account_id, provider_order_id) do nothing
    returning id
  `);
  return linhas.length;
}
