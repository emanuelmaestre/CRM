import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/shared/lib/db";
import { pedidoIgnorado } from "@/shared/lib/db/schema/vendas";
import { channelAccount } from "@/shared/lib/db/schema/canais";
import { brand } from "@/shared/lib/db/schema/org";
import { ingerirPedido } from "@/modules/canais/application/ingestao-pedido.service";
import { criarMLProvider } from "@/modules/canais/infrastructure/mercadolivre.provider";
import { criarTikTokShopProvider } from "@/modules/canais/infrastructure/tiktokshop.provider";
import { criarShopeeProvider, SHOPEE_PEDIDOS_LIBERADO } from "@/modules/canais/infrastructure/shopee.provider";
import { isBrandSlug } from "@/shared/config/brands";
import type { PedidoNormalizado } from "@/modules/canais/domain/ports";
import { incorporarQuarentenaPedidos } from "./quarentena-pedidos.service";

import { type CausaPedidoIgnorado } from "./registro-pedido-ignorado";
export { classificarCausa, registrarPedidoIgnorado, marcarPedidoIgnoradoResolvido, type CausaPedidoIgnorado } from "./registro-pedido-ignorado";

/* ── Tela ─────────────────────────────────────────────────────────────── */

/** Todas podem ser retentadas: a tentativa reconsulta o canal e usa o
 * normalizador atual, inclusive quando a falha original era de formato. */
export const CAUSAS_REPROCESSAVEIS: readonly CausaPedidoIgnorado[] = [
  "sku_sem_produto",
  "cliente_duplicado",
  "desconhecida",
  "payload_invalido",
];

/** Consulta sempre o estado atual: payload histórico não deve reverter ajustes.
 *  Exportada porque a conferência financeira (A35) re-busca pelo mesmo caminho:
 *  estado atual do canal, com o mesmo tratamento de canal indisponível. */
export async function rebuscarNoCanal(linha: {
  canal: string;
  brandSlug: string;
  providerOrderId: string;
}): Promise<PedidoNormalizado | null> {
  if (!isBrandSlug(linha.brandSlug)) return null;
  try {
    if (linha.canal === "mercadolivre") {
      const provider = await criarMLProvider(linha.brandSlug);
      return await provider.buscarPedidoPorId(linha.providerOrderId);
    }
    /* A Shopee entra pelo mesmo portão que a busca por janela usa: enquanto o
       app aprovado não tiver a categoria de Pedidos, `SHOPEE_PEDIDOS_LIBERADO`
       segura tudo, e insistir aqui só gastaria cota do proxy para levar 403. */
    if (linha.canal === "shopee" && SHOPEE_PEDIDOS_LIBERADO) {
      const provider = await criarShopeeProvider(linha.brandSlug);
      return await provider.buscarPedidoPorId(linha.providerOrderId);
    }
    if (linha.canal === "tiktokshop") {
      const provider = await criarTikTokShopProvider(linha.brandSlug);
      return (await provider.buscarPedidosPorIds([linha.providerOrderId]))[0] ?? null;
    }
    return null;
  } catch {
    // Sem resposta atual, a pendência continua aberta; não usa dados antigos.
    return null;
  }
}

/** Recuperação histórica idempotente, sem repetir efeitos operacionais. */
export async function reprocessarPedidoIgnorado(
  ctx: { orgId: string },
  id: string,
): Promise<{ ok: true; jaExistia: boolean } | { ok: false; motivo: string }> {
  const [linha] = await db
    .select({
      brandId: pedidoIgnorado.brandId,
      channelAccountId: pedidoIgnorado.channelAccountId,
      providerOrderId: pedidoIgnorado.providerOrderId,
      skus: pedidoIgnorado.skus,
      payload: pedidoIgnorado.payload,
      brandSlug: brand.slug,
      canal: channelAccount.tipo,
    })
    .from(pedidoIgnorado)
    .innerJoin(brand, eq(brand.id, pedidoIgnorado.brandId))
    .innerJoin(channelAccount, eq(channelAccount.id, pedidoIgnorado.channelAccountId))
    .where(and(eq(pedidoIgnorado.id, id), eq(pedidoIgnorado.orgId, ctx.orgId)))
    .limit(1);

  if (!linha) return { ok: false, motivo: "Pendência não encontrada." };


  await db.update(pedidoIgnorado).set({ ultimaVezEm: new Date() }).where(and(eq(pedidoIgnorado.id, id), eq(pedidoIgnorado.orgId, ctx.orgId)));
  const rebuscado = await rebuscarNoCanal(linha);
  // Nunca reescreve o financeiro de hoje com o payload de semanas atrás.
  const pedidoNormalizado = rebuscado;
  if (!pedidoNormalizado) {
    const motivo = "Não foi possível consultar o estado atual no canal. A pendência foi preservada; verifique a conexão e tente novamente.";
    await db.update(pedidoIgnorado).set({ motivo, tentativas: sql`${pedidoIgnorado.tentativas} + 1` })
      .where(and(eq(pedidoIgnorado.id, id), eq(pedidoIgnorado.orgId, ctx.orgId)));
    return { ok: false, motivo };
  }
  // `criadoEm` é Date e a coluna é jsonb: sem o round-trip por JSON, a data
  // iria como objeto vazio e o payload voltaria pior do que estava.
  const payloadAtualizado = rebuscado
    ? (JSON.parse(JSON.stringify(rebuscado)) as Record<string, unknown>)
    : null;

  try {
    const resultado = await ingerirPedido(ctx.orgId, linha.brandId, linha.channelAccountId, pedidoNormalizado, { historico: true });
    await db.update(pedidoIgnorado)
      .set({ resolvidoEm: new Date(), ...(payloadAtualizado ? { payload: payloadAtualizado } : {}) })
      .where(and(eq(pedidoIgnorado.id, id), eq(pedidoIgnorado.orgId, ctx.orgId)));
    return { ok: true, jaExistia: !resultado.novo };
  } catch (error) {
    // A ingestão central já registrou causa, payload e tentativa.
    const motivo = error instanceof Error ? error.message : String(error);
    return { ok: false, motivo };
  }
}

/** Quantas pendências uma única passada tenta.
 *
 *  Cada tentativa pode custar uma rebusca no canal (três chamadas à API do
 *  Mercado Livre: pedido, endereço e frete) mais a transação da ingestão.
 *  Vinte cabem folgados no tempo de uma Server Action; a fila inteira de uma
 *  vez, não — e estourar no meio deixaria metade do trabalho feito sem
 *  ninguém saber quais. Sobrando pendência, o retorno diz quantas, e clicar
 *  de novo continua de onde parou. */
export const TAMANHO_LOTE_REPROCESSO = 20;

/** Tenta a fila aberta de uma vez, da mais antiga para a mais nova.
 *
 *  Existe porque a correção que destravou a fila é sempre a mesma para todo
 *  mundo — o catálogo passou a enxergar anúncio fora do ar, a ingestão passou
 *  a casar pelo anúncio — e nada disso muda de um pedido para o outro. Com 40
 *  pendências, clicar quarenta vezes no mesmo botão não é decisão de
 *  operação: é trabalho braçal.
 *
 *  Uma a uma, em série e sem transação única: pedido que falha não derruba os
 *  outros, e cada um já sai da fila (ou atualiza a própria causa) no momento
 *  em que é tentado. */
export async function reprocessarFilaAberta(ctx: { orgId: string }): Promise<{
  tentados: number;
  resolvidos: number;
  restantes: number;
}> {
  await incorporarQuarentenaPedidos(ctx.orgId);
  const fila = await db
    .select({ id: pedidoIgnorado.id })
    .from(pedidoIgnorado)
    .where(and(
      eq(pedidoIgnorado.orgId, ctx.orgId),
      isNull(pedidoIgnorado.resolvidoEm),
      isNull(pedidoIgnorado.descartadoEm),
      inArray(pedidoIgnorado.causa, [...CAUSAS_REPROCESSAVEIS]),
    ))
    .orderBy(pedidoIgnorado.ultimaVezEm)
    .limit(TAMANHO_LOTE_REPROCESSO);

  let resolvidos = 0;
  for (const pendencia of fila) {
    const resultado = await reprocessarPedidoIgnorado(ctx, pendencia.id);
    if (resultado.ok) resolvidos += 1;
  }

  const [restantes] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(pedidoIgnorado)
    .where(and(
      eq(pedidoIgnorado.orgId, ctx.orgId),
      isNull(pedidoIgnorado.resolvidoEm),
      isNull(pedidoIgnorado.descartadoEm),
      inArray(pedidoIgnorado.causa, [...CAUSAS_REPROCESSAVEIS]),
    ));

  return { tentados: fila.length, resolvidos, restantes: restantes?.total ?? 0 };
}

