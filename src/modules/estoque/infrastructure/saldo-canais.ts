import { sql } from "drizzle-orm";

/**
 * O A5 roda a cada 6h. Duas janelas dão folga para uma execução atrasada sem
 * deixar uma leitura antiga parecer atual indefinidamente.
 */
export const SALDO_FRESCOR_HORAS = 8;
export const SALDO_FRESCOR_MS = SALDO_FRESCOR_HORAS * 60 * 60_000;

function maiorSaldoPublicado(
  orgId: string,
  canais?: readonly string[],
  somenteAtual = false,
) {
  return sql<number | null>`(
    select max(s.saldo) from estoque_canal_saldo s
    join produto_canal pc on pc.id = s.produto_canal_id and pc.org_id = s.org_id
    join channel_account c on c.id = s.channel_account_id and c.org_id = s.org_id
    where s.produto_id = produto.id and s.org_id = ${orgId}
      and pc.ativo = true and c.status = 'conectado'
      ${canais?.length
        ? sql`and c.tipo in (${sql.join(canais.map((canal) => sql`${canal}`), sql`, `)})`
        : sql``}
      ${somenteAtual ? sql`and s.verificado_em >= now() - (${SALDO_FRESCOR_HORAS} * interval '1 hour')` : sql``}
  )`;
}

/** Maior saldo conhecido no escopo escolhido; pode ser uma leitura antiga. */
export function saldoPublicado(orgId: string, canais?: readonly string[]) {
  return sql<number>`coalesce(${maiorSaldoPublicado(orgId, canais)}, 0)`;
}

/**
 * Maior saldo confirmado nas últimas 8h. Null significa “não confirmado”,
 * não “sem estoque”; consumidores não devem converter esse caso em alerta.
 */
export function saldoPublicadoAtual(orgId: string, canais?: readonly string[]) {
  return maiorSaldoPublicado(orgId, canais, true);
}
