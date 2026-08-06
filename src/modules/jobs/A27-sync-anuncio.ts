import { inngest } from "@/shared/lib/inngest/client";
import { db } from "@/shared/lib/db";
import { brand, produto, produtoCanal } from "@/shared/lib/db/schema";
import { channelAccount } from "@/shared/lib/db/schema/canais";
import { and, eq } from "drizzle-orm";
import { resolverChannelProvider } from "@/modules/canais/infrastructure/provider-resolver";
import { emitirEvento } from "@/shared/events";
import { executarComRetry } from "@/modules/canais/application/retry";

export const A27_syncAnuncio = inngest.createFunction(
  {
    id: "A27-sync-anuncio",
    name: "A27 — Sincronização de título/preço de anúncio para canais",
    idempotency: "event.data.orgId + '-' + event.data.produtoId",
    triggers: [{ event: "produto/atualizado" }],
  },
  async ({ event, step }) => {
    const { orgId, produtoId } = event.data as { orgId: string; produtoId: string };

    const produtoRow = await step.run("buscar-produto", () =>
      db
        .select()
        .from(produto)
        .where(and(eq(produto.orgId, orgId), eq(produto.id, produtoId)))
        .then((r) => r[0] ?? null),
    );

    if (!produtoRow) {
      return { sincronizados: 0, motivo: "produto-nao-encontrado" };
    }

    // Mesmo critério do A4: só sincroniza canais com mapeamento explícito
    // (produto_canal), para garantir o listingId/variationId corretos.
    const mapeamentos = await step.run("buscar-mapeamentos-canal", () =>
      db
        .select({
          produtoCanalId: produtoCanal.id,
          channelAccountId: produtoCanal.channelAccountId,
          externalListingId: produtoCanal.externalListingId,
          externalSkuId: produtoCanal.externalSkuId,
          externalWarehouseId: produtoCanal.externalWarehouseId,
          contaTipo: channelAccount.tipo,
          contaMeta: channelAccount.meta,
          contaStatus: channelAccount.status,
          contaBrandId: channelAccount.brandId,
          brandSlug: brand.slug,
        })
        .from(produtoCanal)
        .innerJoin(channelAccount, eq(channelAccount.id, produtoCanal.channelAccountId))
        .innerJoin(brand, and(
          eq(brand.id, channelAccount.brandId),
          eq(brand.orgId, channelAccount.orgId),
        ))
        .where(and(
          eq(produtoCanal.orgId, orgId),
          eq(produtoCanal.produtoId, produtoId),
          eq(produtoCanal.ativo, true),
        )),
    );

    const resultados: { conta: string; listingId: string; ok: boolean; erro?: string }[] = [];

    for (const m of mapeamentos) {
      if (m.contaStatus !== "conectado") {
        resultados.push({ conta: m.channelAccountId, listingId: m.externalListingId, ok: false, erro: `conta-${m.contaStatus}` });
        continue;
      }
      const brandSlug = m.brandSlug || (m.contaMeta as Record<string, string> | null)?.brandSlug;
      let provider = null;
      try {
        provider = await resolverChannelProvider(m.contaTipo, brandSlug ?? "");
      } catch (error) {
        resultados.push({ conta: m.channelAccountId, listingId: m.externalListingId, ok: false, erro: String(error) });
        continue;
      }

      if (!provider) {
        resultados.push({ conta: m.channelAccountId, listingId: m.externalListingId, ok: false, erro: "provider nao suportado" });
        continue;
      }
      if (!provider.sincronizarAnuncio) {
        // Canal ainda não implementa push de título/preço — não é falha, só
        // não sincroniza esse mapeamento específico (ver ports.ts).
        resultados.push({ conta: m.channelAccountId, listingId: m.externalListingId, ok: true, erro: "canal-sem-suporte-anuncio" });
        continue;
      }
      const sincronizarAnuncio = provider.sincronizarAnuncio.bind(provider);

      await step.run(`sync-${m.channelAccountId}`, async () => {
        try {
          await executarComRetry(
            () => sincronizarAnuncio({
              listingId: m.externalListingId,
              skuId: m.externalSkuId,
              warehouseId: m.externalWarehouseId,
            }, { titulo: produtoRow.nome, preco: produtoRow.preco }),
            { tentativas: 3, atrasoInicialMs: 250 },
          );
          await emitirEvento({
            tipo: "estoque.sincronizado",
            orgId,
            brandId: m.contaBrandId,
            entidade: "produto_canal",
            entidadeId: m.produtoCanalId,
            payload: {
              produtoId,
              channelAccountId: m.channelAccountId,
              listingId: m.externalListingId,
              titulo: produtoRow.nome,
              preco: produtoRow.preco,
            },
          });
          resultados.push({ conta: m.channelAccountId, listingId: m.externalListingId, ok: true });
        } catch (err) {
          resultados.push({ conta: m.channelAccountId, listingId: m.externalListingId, ok: false, erro: String(err) });
          await emitirEvento({
            tipo: "canal.degradado",
            orgId,
            brandId: m.contaBrandId,
            entidade: "channel_account",
            entidadeId: m.channelAccountId,
            payload: { motivo: "falha-sync-anuncio", erro: String(err) },
          });
        }
      });
    }

    const resumo = {
      produtoId,
      titulo: produtoRow.nome,
      preco: produtoRow.preco,
      mapeamentos: mapeamentos.length,
      sincronizados: resultados.filter((r) => r.ok).length,
      resultados,
    };
    const falhas = resultados.filter((resultado) => !resultado.ok);
    if (falhas.length > 0) {
      throw new Error(`A27 não sincronizou ${falhas.length} de ${resultados.length} mapeamento(s) de anúncio.`);
    }
    return resumo;
  },
);
