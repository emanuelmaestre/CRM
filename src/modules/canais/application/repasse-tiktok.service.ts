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
   para de ser estimado por cima.

   A comissão vai junto, rateada entre os itens, pelo mesmo motivo pelo qual a
   Shopee rateia o escrow: a tela do pedido mostra "Taxa do canal de venda" e o
   lucro por produto precisa saber de qual item saiu a taxa. Isso NÃO muda
   número de lucro — `liquidoDoPedido` prefere o repasse informado e ignora a
   soma de taxas quando ele existe. */

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
  itensComTaxa: number;
  semPedido: number;
  desde: string;
  ate: string;
}

interface ItemRateio {
  id: string;
  quantidade: number;
  precoUnitario: number;
  taxaAtualCentavos: number | null;
}

/** Divide a comissão do pedido entre os itens, proporcional ao valor de cada
 *  linha (preço × quantidade).
 *
 *  Em centavos e com o resto indo para a última linha — sem isso, três itens
 *  de uma comissão de R$ 10,00 gravam 3,33 cada e um centavo evapora, e a soma
 *  da tela deixa de bater com o extrato. É a mesma conta que a ingestão faz
 *  com o escrow da Shopee; pedido sem valor em nenhuma linha divide em partes
 *  iguais, porque proporção por zero não existe. */
export function ratearComissao(
  comissaoCentavos: number,
  itens: ReadonlyArray<{ id: string; quantidade: number; precoUnitario: number }>,
): Map<string, number> {
  const rateio = new Map<string, number>();
  if (itens.length === 0) return rateio;
  const pesos = itens.map((item) => item.precoUnitario * item.quantidade);
  const pesoTotal = pesos.reduce((total, peso) => total + peso, 0);
  let restante = comissaoCentavos;
  itens.forEach((item, indice) => {
    const centavos = indice === itens.length - 1
      ? restante
      : Math.min(restante, Math.round(comissaoCentavos * (pesoTotal > 0 ? pesos[indice] / pesoTotal : 1 / itens.length)));
    restante -= centavos;
    rateio.set(item.id, centavos);
  });
  return rateio;
}

/** Grava o líquido e a comissão dos pedidos de uma conta a partir dos extratos
 *  do período.
 *
 *  Uma instrução por lote em vez de um UPDATE por pedido: a primeira volta de
 *  cada loja cobre o histórico inteiro (1.527 pedidos das três marcas em
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
  let itensComTaxa = 0;
  for (let i = 0; i < repasses.length; i += 200) {
    const resultado = await gravarLote(banco, opcoes.orgId, opcoes.channelAccountId, repasses.slice(i, i + 200));
    atualizados += resultado.atualizados;
    encontrados += resultado.encontrados;
    itensComTaxa += resultado.itensComTaxa;
  }

  return {
    repasses: repasses.length,
    atualizados,
    itensComTaxa,
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
): Promise<{ atualizados: number; encontrados: number; itensComTaxa: number }> {
  const valores = sql.join(
    lote.map((repasse) => sql`(${repasse.orderId}::text, ${repasse.liquido.toFixed(2)}::numeric)`),
    sql`, `,
  );

  const casados = await banco.execute(sql`
    select p.id, p.provider_order_id as "providerOrderId",
           (p.valor_liquido is null or p.valor_liquido <> v.liquido) as muda
    from (values ${valores}) as v(provider_order_id, liquido)
    join pedido p
      on p.provider_order_id = v.provider_order_id
     and p.org_id = ${orgId}
     and p.channel_account_id = ${channelAccountId}
  `);
  const linhas = linhasDe<{ id: string; providerOrderId: string; muda: boolean }>(casados);
  if (linhas.length === 0) return { atualizados: 0, encontrados: 0, itensComTaxa: 0 };

  const paraGravar = linhas.filter((linha) => linha.muda);
  if (paraGravar.length > 0) {
    await banco.execute(sql`
      update pedido p
         set valor_liquido = v.liquido, atualizado_em = now()
        from (values ${valores}) as v(provider_order_id, liquido)
       where p.provider_order_id = v.provider_order_id
         and p.org_id = ${orgId}
         and p.channel_account_id = ${channelAccountId}
         and (p.valor_liquido is null or p.valor_liquido <> v.liquido)
    `);
  }

  const itensComTaxa = await gravarComissao(banco, orgId, lote, linhas);
  return { atualizados: paraGravar.length, encontrados: linhas.length, itensComTaxa };
}

/** Rateia a comissão do extrato entre os itens dos pedidos do lote.
 *
 *  Só a comissão entra aqui, nunca `fee_amount`: aquele campo soma comissão e
 *  frete real, e escrever o pacote inteiro diria na tela que o canal cobrou o
 *  frete que a loja pagou à transportadora. */
async function gravarComissao(
  banco: typeof db,
  orgId: string,
  lote: RepasseTikTok[],
  casados: ReadonlyArray<{ id: string; providerOrderId: string }>,
): Promise<number> {
  const comissaoPorPedido = new Map<string, number>();
  const porOrderId = new Map(lote.map((repasse) => [repasse.orderId, repasse]));
  for (const linha of casados) {
    const repasse = porOrderId.get(linha.providerOrderId);
    if (!repasse || repasse.comissao <= 0) continue;
    comissaoPorPedido.set(linha.id, Math.round(repasse.comissao * 100));
  }
  if (comissaoPorPedido.size === 0) return 0;

  const ids = sql.join([...comissaoPorPedido.keys()].map((id) => sql`${id}::uuid`), sql`, `);
  const resultado = await banco.execute(sql`
    select i.id, i.pedido_id as "pedidoId", i.quantidade,
           i.preco_unitario as "precoUnitario", i.taxa_marketplace as "taxaMarketplace"
      from pedido_item i
      join pedido p on p.id = i.pedido_id and p.org_id = ${orgId}
     where i.pedido_id in (${ids})
     order by i.pedido_id, i.id
  `);

  const porPedido = new Map<string, ItemRateio[]>();
  for (const item of linhasDe<{ id: string; pedidoId: string; quantidade: number; precoUnitario: string; taxaMarketplace: string | null }>(resultado)) {
    const lista = porPedido.get(item.pedidoId) ?? [];
    lista.push({
      id: item.id,
      quantidade: Number(item.quantidade),
      precoUnitario: Number(item.precoUnitario),
      taxaAtualCentavos: item.taxaMarketplace === null ? null : Math.round(Number(item.taxaMarketplace) * 100),
    });
    porPedido.set(item.pedidoId, lista);
  }

  const escritas: Array<{ id: string; centavos: number }> = [];
  for (const [pedidoId, comissaoCentavos] of comissaoPorPedido) {
    const itens = porPedido.get(pedidoId) ?? [];
    for (const [itemId, centavos] of ratearComissao(comissaoCentavos, itens)) {
      if (itens.find((item) => item.id === itemId)?.taxaAtualCentavos === centavos) continue;
      escritas.push({ id: itemId, centavos });
    }
  }
  if (escritas.length === 0) return 0;

  for (let i = 0; i < escritas.length; i += 500) {
    const valores = sql.join(
      escritas.slice(i, i + 500).map((escrita) => sql`(${escrita.id}::uuid, ${(escrita.centavos / 100).toFixed(2)}::numeric)`),
      sql`, `,
    );
    await banco.execute(sql`
      update pedido_item i
         set taxa_marketplace = v.taxa
        from (values ${valores}) as v(id, taxa)
       where i.id = v.id
    `);
  }
  return escritas.length;
}

/** O driver devolve ora um array, ora `{ rows }`, conforme a versão — mesmo
 *  destrinchamento do painel de atualização e dos serviços de Métricas. */
function linhasDe<T>(resultado: unknown): T[] {
  if (Array.isArray(resultado)) return resultado as T[];
  return ((resultado as { rows?: unknown[] })?.rows ?? []) as T[];
}
