import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/shared/lib/db";

export type QualidadeConta = {
  id: string; marca: string; canal: string; status: string;
  pendentes: number; quarentena: number; estoquePendente: number;
  ultimaColeta: string | null; ultimaAvaliacao: string | null;
  estoqueFalhas?: Array<{ listingId: string; erro: string }> | null;
};

/** Cobertura global da organização, não conciliação de um período da tela.
 * Não soma a quarentena já presente na fila, nem transforma falha em zero. */
export async function consultarQualidadeDados(orgId: string): Promise<QualidadeConta[]> {
  const rows = await db.execute(sql`
    select c.id, b.name as marca, c.tipo as canal, c.status,
      (select count(*)::int from pedido_ignorado q where q.org_id = c.org_id
        and q.channel_account_id = c.id and q.resolvido_em is null and q.descartado_em is null) as pendentes,
      (select count(distinct i.provider_record_id)::int from import_item i
        join import_lote l on l.id = i.lote_id and l.org_id = i.org_id
        where i.org_id = c.org_id and l.channel_account_id = c.id
          and l.tipo = 'pedidos_historicos_mercadolivre' and i.status in ('quarentena', 'erro')
          and not exists (select 1 from pedido p where p.org_id = c.org_id
            and p.channel_account_id = c.id and p.provider_order_id = i.provider_record_id)
          and not exists (select 1 from pedido_ignorado q where q.org_id = c.org_id
            and q.channel_account_id = c.id and q.provider_order_id = i.provider_record_id)) as quarentena,
      (select count(*)::int from produto_canal pc
        left join estoque_canal_saldo s on s.produto_canal_id = pc.id and s.org_id = pc.org_id
        where pc.org_id = c.org_id and pc.channel_account_id = c.id and pc.ativo
          and (s.id is null or s.verificado_em < now() - interval '8 hours')) as "estoquePendente",
      c.meta->>'pedidosUltimaColetaCompleta' as "ultimaColeta",
      c.meta->'estoquePendencias' as "estoqueFalhas",
      (select min(v.atualizado_em)::text from (
        select atualizado_em from ml_avaliacao_anuncio where org_id = c.org_id and channel_account_id = c.id
        union all select atualizado_em from shopee_avaliacao_anuncio where org_id = c.org_id and channel_account_id = c.id
      ) v) as "ultimaAvaliacao"
    from channel_account c join brand b on b.id = c.brand_id and b.org_id = c.org_id
    where c.org_id = ${orgId} and c.tipo in ('mercadolivre', 'shopee', 'tiktokshop')
      and c.encerrado_em is null
    order by b.name, c.tipo
  `);
  return rows as unknown as QualidadeConta[];
}
