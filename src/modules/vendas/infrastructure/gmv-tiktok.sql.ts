import { sql } from "drizzle-orm";
import { pedido } from "@/shared/lib/db/schema";

export function dataPagamentoTikTokSql() {
  return sql`case when jsonb_typeof(${pedido.dadosOrigem}->'pagoEmMs') = 'number'
    then case when (${pedido.dadosOrigem}->>'pagoEmMs')::numeric > 0
      then to_timestamp((${pedido.dadosOrigem}->>'pagoEmMs')::double precision / 1000)
    end end`;
}
export function pedidoGmvTikTokSql() {
  // Cancelar ou reembolsar depois não apaga a venda do GMV do TikTok.
  // A evidência é o pagamento original, e não o estado atual do pedido.
  return sql`${pedido.canal} = 'tiktokshop' and ${dataPagamentoTikTokSql()} is not null
    and coalesce(${pedido.dadosOrigem}->>'amostraGratis', 'false') <> 'true'`;
}
export function valorGmvTikTokSql() {
  return sql`case when jsonb_typeof(${pedido.dadosOrigem}->'gmvTikTok') = 'number'
    then (${pedido.dadosOrigem}->>'gmvTikTok')::numeric else ${pedido.total} end`;
}
