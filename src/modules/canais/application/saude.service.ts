import { eq } from "drizzle-orm";
import { db } from "@/shared/lib/db";
import { channelAccount } from "@/shared/lib/db/schema";
import { emitirEvento } from "@/shared/events";
import { criarZApiProvider } from "../infrastructure/zapi.provider";
import { criarShopeeProvider } from "../infrastructure/shopee.provider";
import { criarMLProvider } from "../infrastructure/mercadolivre.provider";
import { criarTikTokShopProvider } from "../infrastructure/tiktokshop.provider";
import type { ChannelProvider, MessagingProvider } from "../domain/ports";

type BrandSlug = "karzi" | "wuwu";

async function resolverProvider(tipo: string, brandSlug: BrandSlug): Promise<ChannelProvider | MessagingProvider | null> {
  try {
    switch (tipo) {
      case "whatsapp":     return criarZApiProvider(brandSlug);
      case "shopee":       return criarShopeeProvider(brandSlug);
      case "mercadolivre": return await criarMLProvider(brandSlug);
      case "tiktokshop":   return criarTikTokShopProvider(brandSlug);
      default:             return null;
    }
  } catch {
    // Credenciais não configuradas — tratado como desconectado
    return null;
  }
}

export async function verificarSaudeConectores(orgId: string): Promise<void> {
  const contas = await db
    .select()
    .from(channelAccount)
    .where(eq(channelAccount.orgId, orgId));

  for (const conta of contas) {
    const statusAnterior = conta.status;
    let novoStatus: "conectado" | "degradado" | "desconectado" = "desconectado";
    let ultimoErro: string | null = null;

    try {
      const brandSlug = (conta.meta as Record<string, string> | null)?.brandSlug as BrandSlug | undefined;
      const provider = await resolverProvider(conta.tipo, brandSlug ?? "karzi");

      if (!provider) {
        novoStatus = "degradado";
        ultimoErro = `Provider "${conta.tipo}" sem credenciais configuradas.`;
      } else {
        const resultado = await provider.saude();
        novoStatus = resultado.status === "ok" ? "conectado"
          : resultado.status === "degradado" ? "degradado"
          : "desconectado";
        ultimoErro = resultado.mensagem && resultado.status !== "ok" ? resultado.mensagem : null;
      }
    } catch (err) {
      novoStatus = "degradado";
      ultimoErro = String(err);
    }

    await db
      .update(channelAccount)
      .set({ status: novoStatus, ultimaVerificacao: new Date(), ultimoErro, updatedAt: new Date() })
      .where(eq(channelAccount.id, conta.id));

    if (statusAnterior !== novoStatus) {
      const tipoEvento =
        novoStatus === "conectado" ? "canal.conectado" :
        novoStatus === "degradado" ? "canal.degradado" :
        "canal.desconectado";

      await emitirEvento({
        tipo: tipoEvento,
        orgId,
        brandId: conta.brandId,
        entidade: "channel_account",
        entidadeId: conta.id,
        payload: { tipo: conta.tipo, statusAnterior, novoStatus, ultimoErro },
      });
    }
  }
}

export async function listarSaudeConectores(orgId: string) {
  return db
    .select()
    .from(channelAccount)
    .where(eq(channelAccount.orgId, orgId));
}
