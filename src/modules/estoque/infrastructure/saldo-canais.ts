import { sql } from "drizzle-orm";

/** Maior saldo publicado no escopo escolhido; não é inventário físico. */
export function saldoPublicado(orgId: string, canais?: readonly string[]) {
  return sql<number>`coalesce((
    select max(s.saldo) from estoque_canal_saldo s
    join produto_canal pc on pc.id = s.produto_canal_id and pc.org_id = s.org_id
    join channel_account c on c.id = s.channel_account_id and c.org_id = s.org_id
    where s.produto_id = produto.id and s.org_id = ${orgId}
      and pc.ativo = true and c.status = 'conectado'
      ${canais?.length ? sql`and c.tipo in ${canais}` : sql``}
  ), 0)`;
}
