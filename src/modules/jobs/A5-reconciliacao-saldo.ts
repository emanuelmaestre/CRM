import { and, eq } from "drizzle-orm";
import { inngest } from "@/shared/lib/inngest/client";
import { db } from "@/shared/lib/db";
import { brand, channelAccount, estoqueCanalSaldo, produtoCanal } from "@/shared/lib/db/schema";
import { emitirEvento } from "@/shared/events";
import { executarComRetry } from "@/modules/canais/application/retry";
import { resolverChannelProvider } from "@/modules/canais/infrastructure/provider-resolver";

/** Coleta o saldo que cada canal informa para os anúncios mapeados.
 *
 *  Substitui a antiga reconciliação, que confrontava um saldo local único
 *  contra N canais e por construção sempre acusava divergência em algum deles.
 *  Aqui não há comparação nem decisão: o canal diz quanto tem, e o sistema
 *  registra. O estoque do produto é derivado desses números na leitura. */
export const A5_coletaSaldoCanais = inngest.createFunction(
  {
    id: "A5-reconciliacao-saldo",
    name: "A5 — Coleta de saldo de estoque por canal",
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
        .where(and(
          eq(produtoCanal.orgId, orgId),
          eq(produtoCanal.ativo, true),
        )),
    );

    const resultados: Array<{
      produtoId: string;
      channelAccountId: string;
      saldoCanal?: number;
      erro?: string;
    }> = [];

    for (const item of mapeamentos) {
      if (item.status !== "conectado") {
        resultados.push({
          produtoId: item.produtoId,
          channelAccountId: item.channelAccountId,
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

        await step.run(`registrar-saldo-${item.produtoCanalId}`, () =>
          db
            .insert(estoqueCanalSaldo)
            .values({
              orgId,
              produtoId: item.produtoId,
              channelAccountId: item.channelAccountId,
              produtoCanalId: item.produtoCanalId,
              saldo: saldoCanal,
              verificadoEm: new Date(),
            })
            .onConflictDoUpdate({
              target: estoqueCanalSaldo.produtoCanalId,
              set: { saldo: saldoCanal, verificadoEm: new Date() },
            }),
        );

        resultados.push({
          produtoId: item.produtoId,
          channelAccountId: item.channelAccountId,
          saldoCanal,
        });
      } catch (error) {
        resultados.push({
          produtoId: item.produtoId,
          channelAccountId: item.channelAccountId,
          erro: String(error),
        });
        await emitirEvento({
          tipo: "canal.degradado",
          orgId,
          brandId: item.brandId,
          entidade: "channel_account",
          entidadeId: item.channelAccountId,
          payload: { motivo: "falha-coleta-estoque", erro: String(error) },
        });
      }
    }

    const resumo = {
      coletados: resultados.filter((item) => item.saldoCanal !== undefined).length,
      falhas: resultados.filter((item) => item.erro).length,
      resultados,
    };
    // Uma conta desconectada ou um anúncio problemático não pode impedir que os
    // demais saldos coletados sejam registrados — por isso o erro só sobe ao
    // final, depois de todos os mapeamentos terem sido tentados.
    if (resumo.falhas > 0) {
      throw new Error(`A5 falhou ao consultar ${resumo.falhas} mapeamento(s) de estoque.`);
    }
    return resumo;
  },
);
