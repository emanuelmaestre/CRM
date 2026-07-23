import { inngest } from "@/shared/lib/inngest/client";
import { db } from "@/shared/lib/db";
import { brand, produto, estoqueSaldo, produtoCanal } from "@/shared/lib/db/schema";
import { channelAccount } from "@/shared/lib/db/schema/canais";
import { and, eq } from "drizzle-orm";
import { resolverChannelProvider } from "@/modules/canais/infrastructure/provider-resolver";
import { emitirEvento } from "@/shared/events";
import { executarComRetry } from "@/modules/canais/application/retry";

export const A4_syncSaldo = inngest.createFunction(
  {
    id: "A4-sync-saldo",
    name: "A4 — Sincronização de saldo de estoque para canais",
    idempotency: "event.data.orgId + '-' + event.data.produtoId",
    triggers: [{ event: "estoque/saldo.atualizado" }],
  },
  async ({ event, step }) => {
    const { orgId, produtoId } = event.data as { orgId: string; produtoId: string };

    const [saldoRow, produtoRow] = await step.run("buscar-saldo-produto", async () => {
      const s = await db
        .select()
        .from(estoqueSaldo)
        .where(and(eq(estoqueSaldo.orgId, orgId), eq(estoqueSaldo.produtoId, produtoId)))
        .then((r) => r[0] ?? null);

      const p = await db
        .select()
        .from(produto)
        .where(and(eq(produto.orgId, orgId), eq(produto.id, produtoId)))
        .then((r) => r[0] ?? null);

      return [s, p] as const;
    });

    if (!saldoRow || !produtoRow) {
      return { sincronizados: 0, motivo: "produto-ou-saldo-nao-encontrado" };
    }

    // Busca mapeamentos produto → anúncio por canal (produto_canal).
    // Só sincroniza canais com mapeamento explícito para garantir o listingId correto.
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
          eq(channelAccount.status, "conectado"),
        ))
    );

    const resultados: { conta: string; listingId: string; ok: boolean; erro?: string }[] = [];

    for (const m of mapeamentos) {
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

      await step.run(`sync-${m.channelAccountId}`, async () => {
        try {
          await executarComRetry(
            () => provider.sincronizarEstoque({
              listingId: m.externalListingId,
              skuId: m.externalSkuId,
              warehouseId: m.externalWarehouseId,
            }, saldoRow.saldo),
            { tentativas: 3, atrasoInicialMs: 250 },
          );
          resultados.push({ conta: m.channelAccountId, listingId: m.externalListingId, ok: true });
        } catch (err) {
          resultados.push({ conta: m.channelAccountId, listingId: m.externalListingId, ok: false, erro: String(err) });
          await emitirEvento({
            tipo: "canal.degradado",
            orgId,
            brandId: m.contaBrandId,
            entidade: "channel_account",
            entidadeId: m.channelAccountId,
            payload: { motivo: "falha-sync-estoque", erro: String(err) },
          });
        }
      });
    }

    return {
      produtoId,
      saldo: saldoRow.saldo,
      mapeamentos: mapeamentos.length,
      sincronizados: resultados.filter((r) => r.ok).length,
      resultados,
    };
  }
);
