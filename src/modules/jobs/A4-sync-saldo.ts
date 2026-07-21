import { inngest } from "@/shared/lib/inngest/client";
import { db } from "@/shared/lib/db";
import { produto, estoqueSaldo } from "@/shared/lib/db/schema";
import { channelAccount } from "@/shared/lib/db/schema/canais";
import { and, eq } from "drizzle-orm";
import { criarMLProvider } from "@/modules/canais/infrastructure/mercadolivre.provider";
import { criarShopeeProvider } from "@/modules/canais/infrastructure/shopee.provider";
import { criarTikTokShopProvider } from "@/modules/canais/infrastructure/tiktokshop.provider";
import { emitirEvento } from "@/shared/events";
import type { ChannelProvider } from "@/modules/canais/domain/ports";

type BrandSlug = "karzi" | "wuwu";

function resolverChannelProvider(tipo: string, brandSlug: BrandSlug): ChannelProvider | null {
  try {
    switch (tipo) {
      case "mercadolivre": return criarMLProvider(brandSlug);
      case "shopee":       return criarShopeeProvider(brandSlug);
      case "tiktokshop":   return criarTikTokShopProvider(brandSlug);
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

    if (!saldoRow || !produtoRow) return { sincronizados: 0, motivo: "produto-ou-saldo-nao-encontrado" };

    const contas = await step.run("buscar-contas-canal", () =>
      db
        .select()
        .from(channelAccount)
        .where(and(eq(channelAccount.orgId, orgId), eq(channelAccount.brandId, produtoRow.brandId), eq(channelAccount.status, "conectado")))
    );

    const resultados: { conta: string; ok: boolean; erro?: string }[] = [];

    for (const conta of contas) {
      const brandSlug = (conta.meta as Record<string, string> | null)?.brandSlug as BrandSlug ?? "karzi";
      const provider = resolverChannelProvider(conta.tipo, brandSlug);

      if (!provider || !("sincronizarEstoque" in provider)) {
        resultados.push({ conta: conta.id, ok: false, erro: "provider sem suporte a sync" });
        continue;
      }

      await step.run(`sync-${conta.id}`, async () => {
        try {
          await (provider as ChannelProvider).sincronizarEstoque(produtoRow.sku, saldoRow.saldo);
          resultados.push({ conta: conta.id, ok: true });
        } catch (err) {
          resultados.push({ conta: conta.id, ok: false, erro: String(err) });
          await emitirEvento({
            tipo: "canal.degradado",
            orgId,
            brandId: conta.brandId,
            entidade: "channel_account",
            entidadeId: conta.id,
            payload: { motivo: "falha-sync-estoque", erro: String(err) },
          });
        }
      });
    }

    return { produtoId, saldo: saldoRow.saldo, sincronizados: resultados.filter((r) => r.ok).length, resultados };
  }
);
