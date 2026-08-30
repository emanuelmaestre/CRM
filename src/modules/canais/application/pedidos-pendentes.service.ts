import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/shared/lib/db";
import { pedido } from "@/shared/lib/db/schema";
import { deveAplicarStatusMarketplace, mapearStatusPedido } from "../domain/order-status";

export type CandidatoPedido = { providerOrderId: string; statusExterno: string };

/**
 * Quais pedidos da janela ainda valem uma leitura de detalhe no canal.
 *
 * A janela de busca é deliberadamente sobreposta — a contingência revisita
 * quatro horas a cada três, e a confirmação de entrada revisita seis. Sem
 * este filtro, cada passagem relia por inteiro (detalhe + repasse) todo
 * pedido que já estava gravado e já liquidado, para reescrever exatamente o
 * mesmo registro. Numa cota medida em bytes, isso é o gasto que mais se
 * repete: a listagem custa uma chamada, o resto custava duas por lote toda
 * vez.
 *
 * Um pedido é relido quando:
 *  - ainda não existe no banco;
 *  - o status que o canal mostra faria o pedido avançar (a mesma régua da
 *    ingestão, `deveAplicarStatusMarketplace`, para não reler para sempre um
 *    pedido cujo status o CRM nunca aplicaria);
 *  - o financeiro ainda não chegou — sem repasse, o pedido conta errado em
 *    Métricas, e um detalhe barato agora evita esperar a reconciliação.
 *
 * Falha de leitura devolve todos os candidatos: economizar chamada nunca pode
 * custar um pedido não importado.
 */
export async function filtrarPedidosPendentes(
  orgId: string,
  channelAccountId: string,
  candidatos: ReadonlyArray<CandidatoPedido>,
  banco: typeof db = db,
): Promise<string[]> {
  const todos = candidatos.map((item) => item.providerOrderId);
  if (todos.length === 0) return [];

  try {
    const existentes = await banco
      .select({
        providerOrderId: pedido.providerOrderId,
        status: pedido.status,
        valorLiquido: pedido.valorLiquido,
      })
      .from(pedido)
      .where(and(
        eq(pedido.orgId, orgId),
        eq(pedido.channelAccountId, channelAccountId),
        inArray(pedido.providerOrderId, todos),
      ));

    const porId = new Map(existentes.map((linha) => [linha.providerOrderId ?? "", linha]));

    return candidatos.flatMap((candidato) => {
      const atual = porId.get(candidato.providerOrderId);
      if (!atual) return [candidato.providerOrderId];
      if (atual.valorLiquido === null) return [candidato.providerOrderId];
      if (!candidato.statusExterno) return [candidato.providerOrderId];
      const proximo = mapearStatusPedido(candidato.statusExterno);
      if (proximo !== atual.status) return [candidato.providerOrderId];
      return deveAplicarStatusMarketplace(atual.status, proximo)
        ? [candidato.providerOrderId]
        : [];
    });
  } catch (error) {
    console.warn("[pedidos-pendentes] leitura falhou; relendo a janela inteira:", error);
    return todos;
  }
}
