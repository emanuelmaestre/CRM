import { inngest } from "@/shared/lib/inngest/client";
import { db } from "@/shared/lib/db";
import { produto, estoqueSaldo, produtoCanal } from "@/shared/lib/db/schema";
import { channelAccount } from "@/shared/lib/db/schema/canais";
import { and, eq } from "drizzle-orm";
import { criarMLProvider } from "@/modules/canais/infrastructure/mercadolivre.provider";
import { criarShopeeProvider } from "@/modules/canais/infrastructure/shopee.provider";
import { criarTikTokShopProvider } from "@/modules/canais/infrastructure/tiktokshop.provider";
import { criarOlistProvider } from "@/modules/canais/infrastructure/olist.provider";
import { emitirEvento } from "@/shared/events";
import type { ChannelProvider } from "@/modules/canais/domain/ports";

type BrandSlug = "karzi" | "wuwu";

async function resolverChannelProvider(tipo: string, brandSlug: BrandSlug): Promise<ChannelProvider | null> {
  try {
    switch (tipo) {
      case "mercadolivre": return await criarMLProvider(brandSlug);
      case "shopee":       return criarShopeeProvider(brandSlug);
      case "tiktokshop":   return criarTikTokShopProvider(brandSlug);
      case "olist":        return criarOlistProvider(brandSlug);
      default:             return null;
    }
  } catch {
    return null;
  }
}

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
          contaTipo: channelAccount.tipo,
          contaMeta: channelAccount.meta,
          contaStatus: channelAccount.status,
          contaBrandId: channelAccount.brandId,
        })
        .from(produtoCanal)
        .innerJoin(channelAccount, eq(channelAccount.id, produtoCanal.channelAccountId))
        .where(and(
          eq(produtoCanal.orgId, orgId),
          eq(produtoCanal.produtoId, produtoId),
          eq(produtoCanal.ativo, true),
          eq(channelAccount.status, "conectado"),
        ))
    );

    const resultados: { conta: string; listingId: string; ok: boolean; erro?: string }[] = [];

    for (const m of mapeamentos) {
      const brandSlug = (m.contaMeta as Record<string, string> | null)?.brandSlug as BrandSlug ?? "karzi";
      const provider = await resolverChannelProvider(m.contaTipo, brandSlug);

      if (!provider) {
        resultados.push({ conta: m.channelAccountId, listingId: m.externalListingId, ok: false, erro: "provider nao suportado" });
        continue;
      }

      await step.run(`sync-${m.channelAccountId}`, async () => {
        try {
          await provider.sincronizarEstoque(m.externalListingId, saldoRow.saldo);
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
