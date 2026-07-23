import { and, eq } from "drizzle-orm";
import { inngest } from "@/shared/lib/inngest/client";
import { db } from "@/shared/lib/db";
import { brand, channelAccount, estoqueSaldo, produtoCanal } from "@/shared/lib/db/schema";
import { emitirEvento } from "@/shared/events";
import { executarComRetry } from "@/modules/canais/application/retry";
import { resolverChannelProvider } from "@/modules/canais/infrastructure/provider-resolver";

export const A5_reconciliacaoSaldo = inngest.createFunction(
  {
    id: "A5-reconciliacao-saldo",
    name: "A5 — Reconciliação noturna de saldo local × canais",
    concurrency: { limit: 1 },
    triggers: [{ cron: "0 3 * * *" }],
  },
  async ({ step }) => {
    const orgId = process.env.DEFAULT_ORG_ID ?? "";
    const mapeamentos = await step.run("buscar-mapeamentos", () =>
      db
        .select({
          produtoCanalId: produtoCanal.id,
          produtoId: produtoCanal.produtoId,
          externalListingId: produtoCanal.externalListingId,
          externalSkuId: produtoCanal.externalSkuId,
          externalWarehouseId: produtoCanal.externalWarehouseId,
          channelAccountId: channelAccount.id,
          tipo: channelAccount.tipo,
          status: channelAccount.status,
          brandId: channelAccount.brandId,
          brandSlug: brand.slug,
          saldoLocal: estoqueSaldo.saldo,
        })
        .from(produtoCanal)
        .innerJoin(channelAccount, and(
          eq(channelAccount.id, produtoCanal.channelAccountId),
          eq(channelAccount.orgId, produtoCanal.orgId),
        ))
        .innerJoin(brand, and(
          eq(brand.id, channelAccount.brandId),
          eq(brand.orgId, channelAccount.orgId),
        ))
        .innerJoin(estoqueSaldo, and(
          eq(estoqueSaldo.produtoId, produtoCanal.produtoId),
          eq(estoqueSaldo.orgId, produtoCanal.orgId),
        ))
        .where(and(
          eq(produtoCanal.orgId, orgId),
          eq(produtoCanal.ativo, true),
        )),
    );

    const resultados: Array<{
      produtoId: string;
      channelAccountId: string;
      saldoLocal: number;
      saldoCanal?: number;
      divergente: boolean;
      erro?: string;
    }> = [];

    for (const item of mapeamentos) {
      if (item.status !== "conectado") {
        resultados.push({
          produtoId: item.produtoId,
          channelAccountId: item.channelAccountId,
          saldoLocal: item.saldoLocal,
          divergente: false,
          erro: `conta-${item.status}`,
        });
        continue;
      }

      try {
        const provider = await resolverChannelProvider(item.tipo, item.brandSlug);
        if (!provider) throw new Error(`Provider ${item.tipo}/${item.brandSlug} não suportado.`);

        const saldoCanal = await step.run(`consultar-${item.produtoCanalId}`, () =>
          executarComRetry(
            () => provider.consultarEstoque({
              listingId: item.externalListingId,
              skuId: item.externalSkuId,
              warehouseId: item.externalWarehouseId,
            }),
            { tentativas: 2, atrasoInicialMs: 250 },
          ),
        );
        const divergente = saldoCanal !== item.saldoLocal;
        resultados.push({
          produtoId: item.produtoId,
          channelAccountId: item.channelAccountId,
          saldoLocal: item.saldoLocal,
          saldoCanal,
          divergente,
        });

        if (divergente) {
          await emitirEvento({
            tipo: "estoque.divergencia_detectada",
            orgId,
            brandId: item.brandId,
            entidade: "produto_canal",
            entidadeId: item.produtoCanalId,
            payload: {
              produtoId: item.produtoId,
              channelAccountId: item.channelAccountId,
              externalListingId: item.externalListingId,
              saldoLocal: item.saldoLocal,
              saldoCanal,
              acao: "alertar_sem_corrigir",
            },
          });
        }
      } catch (error) {
        resultados.push({
          produtoId: item.produtoId,
          channelAccountId: item.channelAccountId,
          saldoLocal: item.saldoLocal,
          divergente: false,
          erro: String(error),
        });
        await emitirEvento({
          tipo: "canal.degradado",
          orgId,
          brandId: item.brandId,
          entidade: "channel_account",
          entidadeId: item.channelAccountId,
          payload: { motivo: "falha-reconciliacao-estoque", erro: String(error) },
        });
      }
    }

    return {
      verificados: resultados.filter((item) => item.saldoCanal !== undefined).length,
      divergencias: resultados.filter((item) => item.divergente).length,
      falhas: resultados.filter((item) => item.erro).length,
      resultados,
    };
  },
);
