import { and, desc, eq, inArray, isNotNull, or } from "drizzle-orm";
import { db } from "@/shared/lib/db";
import { brand, channelAccount, eventoDominio, jobRun } from "@/shared/lib/db/schema";
import { emitirEvento } from "@/shared/events";
import { criarZApiProvider } from "../infrastructure/zapi.provider";
import { criarShopeeProvider } from "../infrastructure/shopee.provider";
import { criarMLProvider } from "../infrastructure/mercadolivre.provider";
import { criarTikTokShopProvider } from "../infrastructure/tiktokshop.provider";
import { criarOlistProvider } from "../infrastructure/olist.provider";
import type { ChannelProvider, MessagingProvider } from "../domain/ports";

type BrandSlug = "karzi" | "wuwu";

async function resolverProvider(tipo: string, brandSlug: BrandSlug): Promise<ChannelProvider | MessagingProvider | null> {
  try {
    switch (tipo) {
      case "whatsapp":     return criarZApiProvider(brandSlug);
      case "shopee":       return criarShopeeProvider(brandSlug);
      case "mercadolivre": return await criarMLProvider(brandSlug);
      case "tiktokshop":   return criarTikTokShopProvider(brandSlug);
      case "olist":        return criarOlistProvider(brandSlug);
      default:             return null;
    }
  } catch {
    // Credenciais não configuradas — tratado como desconectado
    return null;
  }
}

export async function verificarSaudeConectores(orgId: string): Promise<void> {
  const contas = await db
    .select({ conta: channelAccount, brandSlug: brand.slug })
    .from(channelAccount)
    .innerJoin(brand, and(
      eq(brand.id, channelAccount.brandId),
      eq(brand.orgId, channelAccount.orgId),
    ))
    .where(eq(channelAccount.orgId, orgId));

  for (const item of contas) {
    const conta = item.conta;
    const statusAnterior = conta.status;
    let novoStatus: "conectado" | "degradado" | "desconectado" = "desconectado";
    let ultimoErro: string | null = null;

    try {
      if (item.brandSlug !== "karzi" && item.brandSlug !== "wuwu") {
        throw new Error(`Marca ${item.brandSlug} sem provider configurado.`);
      }
      const provider = await resolverProvider(conta.tipo, item.brandSlug);

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
      .where(and(eq(channelAccount.id, conta.id), eq(channelAccount.orgId, orgId)));

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

const EVENTOS_DE_FALHA = [
  "backup.falhou",
  "canal.degradado",
  "canal.desconectado",
  "importacao.com_erros",
  "mensagem.falhou",
  "regua.falha_definitiva",
] as const;

export interface PainelSaudeData {
  conectores: Array<{
    id: string;
    tipo: string;
    status: string;
    ultimaVerificacao: string | null;
    ultimoErro: string | null;
  }>;
  jobs: Array<{
    id: string;
    nome: string;
    status: string;
    tentativa: string;
    erro: string | null;
    iniciadoEm: string;
    finalizadoEm: string | null;
  }>;
  falhas: Array<{
    id: string;
    origem: "job" | "evento";
    tipo: string;
    mensagem: string;
    createdAt: string;
  }>;
}

export async function obterPainelSaude(orgId: string): Promise<PainelSaudeData> {
  const [contas, execucoes, jobsComFalha, eventosComFalha] = await Promise.all([
    db.select({
      id: channelAccount.id,
      tipo: channelAccount.tipo,
      status: channelAccount.status,
      ultimaVerificacao: channelAccount.ultimaVerificacao,
      ultimoErro: channelAccount.ultimoErro,
    }).from(channelAccount).where(eq(channelAccount.orgId, orgId)).orderBy(channelAccount.tipo),
    db.select({
      id: jobRun.id,
      nome: jobRun.nome,
      status: jobRun.status,
      tentativa: jobRun.tentativa,
      erro: jobRun.erro,
      iniciadoEm: jobRun.iniciadoEm,
      finalizadoEm: jobRun.finalizadoEm,
    }).from(jobRun).where(eq(jobRun.orgId, orgId)).orderBy(desc(jobRun.iniciadoEm)).limit(20),
    db.select({
      id: jobRun.id,
      nome: jobRun.nome,
      status: jobRun.status,
      erro: jobRun.erro,
      createdAt: jobRun.finalizadoEm,
      iniciadoEm: jobRun.iniciadoEm,
    }).from(jobRun).where(and(
      eq(jobRun.orgId, orgId),
      or(eq(jobRun.status, "falhou"), eq(jobRun.status, "erro"), isNotNull(jobRun.erro)),
    )).orderBy(desc(jobRun.iniciadoEm)).limit(20),
    db.select({
      id: eventoDominio.id,
      tipo: eventoDominio.tipo,
      payload: eventoDominio.payload,
      createdAt: eventoDominio.createdAt,
    }).from(eventoDominio).where(and(
      eq(eventoDominio.orgId, orgId),
      inArray(eventoDominio.tipo, [...EVENTOS_DE_FALHA]),
    )).orderBy(desc(eventoDominio.createdAt)).limit(20),
  ]);

  const falhas: PainelSaudeData["falhas"] = [
    ...jobsComFalha.map((item) => ({
      id: item.id,
      origem: "job" as const,
      tipo: item.nome,
      mensagem: item.erro ?? `Execução encerrada com status ${item.status}.`,
      createdAt: (item.createdAt ?? item.iniciadoEm).toISOString(),
    })),
    ...eventosComFalha.map((item) => {
      const payload = item.payload as Record<string, unknown>;
      return {
        id: item.id,
        origem: "evento" as const,
        tipo: item.tipo,
        mensagem: String(payload.ultimoErro ?? payload.erro ?? payload.mensagem ?? "Falha operacional registrada."),
        createdAt: item.createdAt.toISOString(),
      };
    }),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20);

  return {
    conectores: contas.map((item) => ({
      ...item,
      ultimaVerificacao: item.ultimaVerificacao?.toISOString() ?? null,
    })),
    jobs: execucoes.map((item) => ({
      ...item,
      iniciadoEm: item.iniciadoEm.toISOString(),
      finalizadoEm: item.finalizadoEm?.toISOString() ?? null,
    })),
    falhas,
  };
}
