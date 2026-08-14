import { and, eq, sql } from "drizzle-orm";
import { inngest } from "@/shared/lib/inngest/client";
import { db } from "@/shared/lib/db";
import { brand, channelAccount, estoqueCanalSaldo, pedidoItem, produtoCanal } from "@/shared/lib/db/schema";
import { resolverChannelProvider } from "@/modules/canais/infrastructure/provider-resolver";

/** Recoleta o saldo dos produtos de um pedido assim que ele é pago.
 *
 *  A varredura completa (A5) roda de hora em hora e serve de rede de segurança,
 *  inclusive para alterações feitas à mão no painel do canal. Mas venda é o
 *  momento em que o estoque de fato muda, e esperar até uma hora para refletir
 *  isso deixa o alerta de mínimo sempre atrasado justamente nos itens que estão
 *  girando. Aqui só os produtos daquele pedido são consultados — dois ou três
 *  anúncios, custo irrisório perto dos ~550 de uma varredura.
 *
 *  Consulta o canal em vez de subtrair a quantidade vendida do saldo guardado:
 *  o mesmo lote é anunciado em mais de um canal, então quem sabe o número certo
 *  é sempre o canal, não uma conta local. */
export const A29_recoletaPorVenda = inngest.createFunction(
  {
    id: "A29-recoleta-por-venda",
    name: "A29 — Recoleta de estoque dos produtos vendidos",
    // Um pedido pago só precisa de uma recoleta, mesmo que o evento chegue
    // repetido pelo webhook e pelo poll de contingência.
    idempotency: "event.data.orgId + '-' + event.data.entityId",
    triggers: [{ event: "pedido/pago" }],
  },
  async ({ event, step }) => {
    const { orgId, entityId: pedidoId } = event.data as { orgId: string; entityId: string };

    const mapeamentos = await step.run("buscar-mapeamentos-do-pedido", () =>
      db
        .selectDistinct({
          produtoCanalId: produtoCanal.id,
          produtoId: produtoCanal.produtoId,
          externalListingId: produtoCanal.externalListingId,
          externalSkuId: produtoCanal.externalSkuId,
          externalWarehouseId: produtoCanal.externalWarehouseId,
          channelAccountId: channelAccount.id,
          tipo: channelAccount.tipo,
          brandSlug: brand.slug,
        })
        .from(pedidoItem)
        .innerJoin(produtoCanal, and(
          eq(produtoCanal.produtoId, pedidoItem.produtoId),
          eq(produtoCanal.orgId, orgId),
          eq(produtoCanal.ativo, true),
        ))
        .innerJoin(channelAccount, and(
          eq(channelAccount.id, produtoCanal.channelAccountId),
          eq(channelAccount.status, "conectado"),
        ))
        .innerJoin(brand, eq(brand.id, channelAccount.brandId))
        .where(eq(pedidoItem.pedidoId, pedidoId)),
    );

    if (mapeamentos.length === 0) {
      return { recoletados: 0, motivo: "pedido-sem-mapeamento-de-canal" };
    }

    const resultado = await step.run("consultar-e-registrar", async () => {
      const saldos = await Promise.all(mapeamentos.map(async (item) => {
        try {
          const provider = await resolverChannelProvider(item.tipo, item.brandSlug);
          if (!provider) return null;
          const saldo = await provider.consultarEstoque({
            listingId: item.externalListingId,
            skuId: item.externalSkuId,
            warehouseId: item.externalWarehouseId,
          });
          return { item, saldo };
        } catch {
          // Falha aqui não é crítica: a varredura horária corrige. Insistir
          // faria o pedido ser reprocessado sem necessidade.
          return null;
        }
      }));

      const linhas = saldos
        .filter((linha): linha is NonNullable<typeof linha> => linha !== null)
        .map((linha) => ({
          orgId,
          produtoId: linha.item.produtoId,
          channelAccountId: linha.item.channelAccountId,
          produtoCanalId: linha.item.produtoCanalId,
          saldo: linha.saldo,
          verificadoEm: new Date(),
        }));

      if (linhas.length > 0) {
        await db
          .insert(estoqueCanalSaldo)
          .values(linhas)
          .onConflictDoUpdate({
            target: estoqueCanalSaldo.produtoCanalId,
            set: { saldo: sql`excluded.saldo`, verificadoEm: sql`excluded.verificado_em` },
          });
      }

      return { gravados: linhas.length };
    });

    return { pedidoId, mapeamentos: mapeamentos.length, recoletados: resultado.gravados };
  },
);
