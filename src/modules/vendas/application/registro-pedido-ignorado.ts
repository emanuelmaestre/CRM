import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/shared/lib/db";
import { pedidoIgnorado } from "@/shared/lib/db/schema/vendas";
import { ehErroSkuSemProduto } from "@/modules/canais/domain/errors";

export type CausaPedidoIgnorado =
  | "sku_sem_produto"
  | "cliente_duplicado"
  | "payload_invalido"
  | "desconhecida";

/** Traduz o erro da ingestão numa causa que a tela sabe explicar.
 *
 *  A classificação existe porque a AÇÃO é diferente em cada caso, e só duas
 *  delas se resolvem editando no canal:
 *
 *  - `sku_sem_produto`   → o operador acerta o anúncio na Shopee/ML
 *  - `cliente_duplicado` → dado do CRM, ninguém resolve na loja
 *  - `payload_invalido`  → bug nosso, ninguém resolve na loja
 *
 *  Mostrar só a mensagem crua fazia as quatro parecerem a mesma coisa. */
export function classificarCausa(erro: unknown): CausaPedidoIgnorado {
  if (ehErroSkuSemProduto(erro)) return "sku_sem_produto";
  const texto = erro instanceof Error ? erro.message : String(erro);
  // Índices únicos de cliente: uq_cliente_org_telefone_active e irmãos. A
  // Shopee entrega telefone mascarado, então compradores diferentes colidem
  // no mesmo valor — foi o que derrubou pedidos em 25/08/2026.
  if (/uq_cliente_org_|duplicate key|insert into "cliente"/i.test(texto)) return "cliente_duplicado";
  // Zod rejeitando o pedido antes de qualquer escrita.
  if (/too_small|invalid_type|expected string|ZodError|"path"/i.test(texto)) return "payload_invalido";
  return "desconhecida";
}

/** Uma linha por pedido recusado, POR CONTA — atualizada a cada tentativa.
 *
 *  Sem o upsert, cada sincronização criaria uma linha nova para os mesmos
 *  346 pedidos. `tentativas` acumula, e `ultimaVezEm` é o que diz se aquilo
 *  ainda está acontecendo ou é resquício de um problema já resolvido. */
export async function registrarPedidoIgnorado(entrada: {
  orgId: string;
  brandId: string;
  channelAccountId: string;
  providerOrderId: string;
  causa: CausaPedidoIgnorado;
  motivo: string;
  skus: string[];
  payload: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await db.insert(pedidoIgnorado).values({
      orgId: entrada.orgId,
      brandId: entrada.brandId,
      channelAccountId: entrada.channelAccountId,
      providerOrderId: entrada.providerOrderId,
      causa: entrada.causa,
      motivo: entrada.motivo.slice(0, 500),
      skus: entrada.skus.length > 0 ? entrada.skus : null,
      payload: entrada.payload ? JSON.parse(JSON.stringify(entrada.payload)) : null,
    }).onConflictDoUpdate({
      target: [pedidoIgnorado.channelAccountId, pedidoIgnorado.providerOrderId],
      set: {
        causa: entrada.causa,
        motivo: entrada.motivo.slice(0, 500),
        skus: entrada.skus.length > 0 ? entrada.skus : null,
        payload: entrada.payload ? JSON.parse(JSON.stringify(entrada.payload)) : sql`${pedidoIgnorado.payload}`,
        tentativas: sql`${pedidoIgnorado.tentativas} + 1`,
        ultimaVezEm: new Date(),
        // Voltou a falhar: reabre. Um pedido pode ser resolvido e quebrar de
        // novo por outro motivo, e a tela precisa mostrá-lo de volta.
        resolvidoEm: null,
      },
    });
  } catch (error) {
    // Sem persistência não há recuperação garantida: o chamador deve falhar
    // para o webhook/job repetir, nunca confirmar recebimento durável.
    console.error(`[pedidos-ignorados] falha ao registrar ${entrada.providerOrderId}`, error);
    throw error;
  }
}

/** Marca como resolvido quando o pedido finalmente entra. Silencioso quando
 *  não havia pendência — é o caso normal, a esmagadora maioria dos pedidos. */
export async function marcarPedidoIgnoradoResolvido(
  orgId: string,
  channelAccountId: string,
  providerOrderId: string,
): Promise<void> {
  try {
    await db.update(pedidoIgnorado)
      .set({ resolvidoEm: new Date() })
      .where(and(
        eq(pedidoIgnorado.orgId, orgId),
        eq(pedidoIgnorado.channelAccountId, channelAccountId),
        eq(pedidoIgnorado.providerOrderId, providerOrderId),
        isNull(pedidoIgnorado.resolvidoEm),
      ));
  } catch (error) {
    console.error(`[pedidos-ignorados] falha ao resolver ${providerOrderId}`, error);
  }
}
