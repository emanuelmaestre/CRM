import { sql } from "drizzle-orm";
import { db } from "@/shared/lib/db";
import { criarTikTokShopProvider, type RepasseTikTok } from "../infrastructure/tiktokshop.provider";
import type { BrandSlug } from "@/shared/config/brands";

/* ── Por que existe uma varredura de repasse ────────────────────────────
   O pedido do TikTok entra no CRM com o bruto e sem líquido: a API de pedidos
   não expõe retenção nenhuma. Quem tem esse número é o extrato, e o extrato só
   nasce quando o TikTok paga — dias depois da venda. Não dá, portanto, para
   preencher o líquido na ingestão como a Shopee faz com o escrow; tem que
   haver uma volta que passe depois e complete o que já está gravado.

   O `valor_liquido` é o campo que Métricas e o resumo de Vendas já leem para
   todos os canais (`liquidoDoPedido`): assim que ele existe, o lucro do TikTok
   para de ser estimado por cima. É por isso que a varredura grava ali e não
   numa tabela nova. */

/** Quantos dias de extrato cada volta varre.
 *
 *  Quarenta e cinco, não sete: o repasse do TikTok sai dias depois da venda, e
 *  a devolução — que entra como transação NEGATIVA num extrato posterior —
 *  pode sair semanas depois. Como o líquido gravado é a soma do que estiver
 *  DENTRO da janela, janela curta devolveria um líquido alto demais para
 *  pedido devolvido. Reprocessar extrato já lido não custa registro: a
 *  gravação é idempotente e só escreve quando o valor muda. */
export const DIAS_REPASSE_TIKTOK = 45;

export interface ResumoRepasseTikTok {
  repasses: number;
  atualizados: number;
  semPedido: number;
  desde: string;
  ate: string;
}

/** Grava o líquido dos pedidos de uma conta a partir dos extratos do período.
 *
 *  Uma instrução por lote em vez de um UPDATE por pedido: a primeira volta de
 *  cada loja cobre o histórico inteiro (1.526 pedidos nas três marcas em
 *  03/09/2026) e mil idas ao banco por conta seria o gargalo da rotina, não a
 *  API. O `org_id` entra explícito no WHERE — SQL cru não herda o filtro de
 *  tenant de lugar nenhum. */
export async function conciliarRepassesTikTok(opcoes: {
  orgId: string;
  channelAccountId: string;
  brandSlug: BrandSlug;
  desde?: Date;
  ate?: Date;
  banco?: typeof db;
}): Promise<ResumoRepasseTikTok> {
  const banco = opcoes.banco ?? db;
  const ate = opcoes.ate ?? new Date();
  const desde = opcoes.desde ?? new Date(ate.getTime() - DIAS_REPASSE_TIKTOK * 24 * 60 * 60 * 1000);

  const provider = await criarTikTokShopProvider(opcoes.brandSlug);
  const repasses = await provider.listarRepasses(desde, ate);

  let atualizados = 0;
  let encontrados = 0;
  for (let i = 0; i < repasses.length; i += 200) {
    const lote = repasses.slice(i, i + 200);
    const { atualizados: gravados, encontrados: casados } = await gravarLote(
      banco, opcoes.orgId, opcoes.channelAccountId, lote,
    );
    atualizados += gravados;
    encontrados += casados;
  }

  return {
    repasses: repasses.length,
    atualizados,
    /* Repasse sem pedido no CRM não é erro: o extrato cobre pedidos anteriores
       à primeira importação daquela loja. Vira número no resumo para que uma
       divergência grande apareça em vez de passar batido. */
    semPedido: repasses.length - encontrados,
    desde: desde.toISOString(),
    ate: ate.toISOString(),
  };
}

async function gravarLote(
  banco: typeof db,
  orgId: string,
  channelAccountId: string,
  lote: RepasseTikTok[],
): Promise<{ atualizados: number; encontrados: number }> {
  const valores = sql.join(
    lote.map((repasse) => sql`(${repasse.orderId}::text, ${repasse.liquido.toFixed(2)}::numeric)`),
    sql`, `,
  );

  const casados = await banco.execute(sql`
    select p.id, (p.valor_liquido is null or p.valor_liquido <> v.liquido) as muda
    from (values ${valores}) as v(provider_order_id, liquido)
    join pedido p
      on p.provider_order_id = v.provider_order_id
     and p.org_id = ${orgId}
     and p.channel_account_id = ${channelAccountId}
  `);
  const linhas = linhasDe<{ id: string; muda: boolean }>(casados);
  const paraGravar = linhas.filter((linha) => linha.muda);
  if (paraGravar.length === 0) return { atualizados: 0, encontrados: linhas.length };

  await banco.execute(sql`
    update pedido p
       set valor_liquido = v.liquido, atualizado_em = now()
      from (values ${valores}) as v(provider_order_id, liquido)
     where p.provider_order_id = v.provider_order_id
       and p.org_id = ${orgId}
       and p.channel_account_id = ${channelAccountId}
       and (p.valor_liquido is null or p.valor_liquido <> v.liquido)
  `);
  return { atualizados: paraGravar.length, encontrados: linhas.length };
}

/** O driver devolve ora um array, ora `{ rows }`, conforme a versão — mesmo
 *  destrinchamento do painel de atualização e dos serviços de Métricas. */
function linhasDe<T>(resultado: unknown): T[] {
  if (Array.isArray(resultado)) return resultado as T[];
  return ((resultado as { rows?: unknown[] })?.rows ?? []) as T[];
}
