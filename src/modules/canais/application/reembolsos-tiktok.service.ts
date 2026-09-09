import { and, eq, sql } from "drizzle-orm";
import { isDeepStrictEqual } from "node:util";
import { db } from "@/shared/lib/db";
import { pedido } from "@/shared/lib/db/schema";
import { criarTikTokShopProvider } from "../infrastructure/tiktokshop.provider";
import { mesclarReembolsosTikTok, type ReembolsoTikTok } from "../domain/reembolsos-tiktok";
import type { BrandSlug } from "@/shared/config/brands";

export async function conciliarReembolsosTikTok(opcoes: {
  orgId: string; channelAccountId: string; brandSlug: BrandSlug; desde: Date; ate: Date;
  orderIds?: readonly string[];
}) {
  const provider = await criarTikTokShopProvider(opcoes.brandSlug);
  // A leitura precisa terminar inteira antes da primeira gravação.
  const casos = await provider.listarReembolsos(opcoes.desde, opcoes.ate, opcoes.orderIds);
  const porPedido = new Map<string, ReembolsoTikTok[]>();
  for (const caso of casos) porPedido.set(caso.orderId, [...(porPedido.get(caso.orderId) ?? []), caso]);
  let atualizados = 0;
  const semPedido: string[] = [];
  for (const [orderId, recebidos] of porPedido) {
    const resultado = await db.transaction(async (tx) => {
      const filtro = and(eq(pedido.orgId, opcoes.orgId), eq(pedido.channelAccountId, opcoes.channelAccountId),
        eq(pedido.canal, "tiktokshop"), eq(pedido.providerOrderId, orderId));
      const [atual] = await tx.select({ id: pedido.id, dados: pedido.dadosOrigem }).from(pedido).where(filtro).for("update");
      if (!atual) return "ausente";
      const dados = (atual.dados ?? {}) as Record<string, unknown>;
      const antigos = Array.isArray(dados.reembolsosTikTok) ? dados.reembolsosTikTok as ReembolsoTikTok[] : [];
      const mesclados = mesclarReembolsosTikTok(antigos, recebidos);
      if (isDeepStrictEqual(antigos, mesclados)) return "inalterado";
      // Sem mudar estágio operacional, estoque, total original ou versão do
      // pedido: a versão do caso de pós-venda é independente da do pedido.
      await tx.update(pedido).set({
        dadosOrigem: sql`jsonb_set(coalesce(${pedido.dadosOrigem}, '{}'::jsonb), '{reembolsosTikTok}', ${JSON.stringify(mesclados)}::jsonb, true)`,
        updatedAt: new Date(),
      }).where(filtro);
      return "atualizado";
    });
    if (resultado === "atualizado") atualizados++;
    if (resultado === "ausente") semPedido.push(orderId);
  }
  return { casos: casos.length, pedidos: porPedido.size, atualizados, semPedido };
}
