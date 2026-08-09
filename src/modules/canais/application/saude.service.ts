import { and, desc, eq, inArray, isNotNull, or } from "drizzle-orm";
import { db } from "@/shared/lib/db";
import { brand, channelAccount, eventoDominio, jobRun } from "@/shared/lib/db/schema";
import { emitirEvento } from "@/shared/events";
import { criarShopeeProvider } from "../infrastructure/shopee.provider";
import { criarMLProvider } from "../infrastructure/mercadolivre.provider";
import { criarTikTokShopProvider } from "../infrastructure/tiktokshop.provider";
import { criarOlistProvider } from "../infrastructure/olist.provider";
import type { ChannelProvider } from "../domain/ports";
import { isBrandSlug, type BrandSlug } from "@/shared/config/brands";

async function resolverProvider(tipo: string, brandSlug: BrandSlug): Promise<ChannelProvider | null> {
  try {
    switch (tipo) {
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
      if (!isBrandSlug(item.brandSlug)) {
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

const CORE_ENV = [
  "DATABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "DEFAULT_ORG_ID",
];

const INNGEST_ENV = ["INNGEST_SIGNING_KEY", "INNGEST_EVENT_KEY"];
const OPENAI_ENV = ["OPENAI_API_KEY"];
const STORAGE_BUCKET = "documentos";
const CANAIS_GO_LIVE = ["mercadolivre", "shopee", "tiktokshop", "olist"] as const;

function configured(name: string): boolean {
  const value = process.env[name]?.trim();
  return Boolean(value && !/^(your-|replace-|changeme|placeholder)/i.test(value));
}

function readinessFromMissing(id: string, label: string, required: string[], okDetail: string) {
  const missing = required.filter((name) => !configured(name));
  return {
    id,
    label,
    status: missing.length === 0 ? "ok" as const : "pendente" as const,
    detail: missing.length === 0
      ? okDetail
      : `Variaveis ausentes: ${missing.join(", ")}`,
  };
}

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
  prontidao: Array<{
    id: string;
    label: string;
    status: "ok" | "pendente" | "falhou";
    detail: string;
  }>;
  backup: Array<{
    label: string;
    value: string;
  }>;
}

export async function obterPainelSaude(orgId: string): Promise<PainelSaudeData> {
  const [contas, execucoes, jobsComFalha, eventosComFalha, ultimoBackup] = await Promise.all([
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
    db.select({
      nome: jobRun.nome,
      status: jobRun.status,
      erro: jobRun.erro,
      iniciadoEm: jobRun.iniciadoEm,
      finalizadoEm: jobRun.finalizadoEm,
    }).from(jobRun).where(and(
      eq(jobRun.orgId, orgId),
      eq(jobRun.nome, "A20-backup-verificacao"),
    )).orderBy(desc(jobRun.iniciadoEm)).limit(1).then((rows) => rows[0] ?? null),
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

  const tiposConectados = new Set(contas.filter((item) => item.status === "conectado").map((item) => item.tipo));
  const tiposCadastrados = new Set(contas.map((item) => item.tipo));
  const canaisAusentes = CANAIS_GO_LIVE.filter((tipo) => !tiposCadastrados.has(tipo));
  const canaisNaoConectados = CANAIS_GO_LIVE.filter((tipo) => tiposCadastrados.has(tipo) && !tiposConectados.has(tipo));
  const jobsRecentes = new Set(execucoes.map((item) => item.nome));

  const prontidao: PainelSaudeData["prontidao"] = [
    readinessFromMissing("env-core", "Ambiente base", CORE_ENV, "Variaveis essenciais configuradas."),
    readinessFromMissing("inngest", "Inngest", INNGEST_ENV, "Chaves Inngest presentes para jobs e webhooks internos."),
    readinessFromMissing("openai", "OpenAI", OPENAI_ENV, "Chave OpenAI presente para IA e documentos executivos."),
    {
      id: "external-sends",
      label: "Envios externos",
      status: process.env.EXTERNAL_SENDS_ENABLED === "true" ? "ok" : "pendente",
      detail: process.env.EXTERNAL_SENDS_ENABLED === "true"
        ? "Disparos externos liberados neste ambiente."
        : "Bloqueado por seguranca ate homologar canais, opt-in, marca e idempotencia.",
    },
    {
      id: "channel-accounts",
      label: "Contas de canal",
      status: canaisAusentes.length === 0 && canaisNaoConectados.length === 0
        ? "ok"
        : canaisNaoConectados.length > 0 ? "falhou" : "pendente",
      detail: [
        canaisAusentes.length > 0 ? `Ausentes: ${canaisAusentes.join(", ")}` : null,
        canaisNaoConectados.length > 0 ? `Nao conectados: ${canaisNaoConectados.join(", ")}` : null,
        canaisAusentes.length === 0 && canaisNaoConectados.length === 0 ? "Canais prioritarios cadastrados e conectados." : null,
      ].filter(Boolean).join(" · "),
    },
    {
      id: "jobs-operacionais",
      label: "Jobs operacionais",
      status: jobsRecentes.has("A18-saude-conectores") && jobsRecentes.has("A24-poll-pedidos") ? "ok" : "pendente",
      detail: jobsRecentes.has("A18-saude-conectores") && jobsRecentes.has("A24-poll-pedidos")
        ? "A18 e A24 ja registraram execucao."
        : "Aguardando execucao observavel de A18-saude-conectores e A24-poll-pedidos.",
    },
    {
      id: "storage-documentos",
      label: "Storage de documentos",
      status: "pendente",
      detail: `Confirmar bucket "${STORAGE_BUCKET}", politicas privadas e URL assinada em ambiente real.`,
    },
    {
      id: "backup-restore",
      label: "Backup e restore",
      status: ultimoBackup?.status === "concluido" ? "ok" : "pendente",
      detail: ultimoBackup
        ? `Ultimo A20: ${ultimoBackup.status}${ultimoBackup.erro ? ` · ${ultimoBackup.erro}` : ""}`
        : "Nenhuma execucao de A20-backup-verificacao registrada.",
    },
  ];

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
    prontidao,
    backup: [
      {
        label: "Ultimo backup automatico",
        value: ultimoBackup?.finalizadoEm?.toISOString() ?? ultimoBackup?.iniciadoEm.toISOString() ?? "—",
      },
      {
        label: "Ultimo teste de restauracao",
        value: ultimoBackup?.status === "concluido" ? "Verificar evidencia no RUNBOOK" : "—",
      },
      { label: "RPO alvo", value: "24 horas" },
      { label: "RTO alvo", value: "4 horas" },
    ],
  };
}
