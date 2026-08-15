"use server";

import { z } from "zod";
import { obterDesempenhoPublicacoes, type DesempenhoPublicacoesResultado } from "@/modules/metricas/application/publicacoes.service";
import { getCrudContext } from "@/shared/lib/get-crud-context";
import { assertPerfil } from "@/shared/lib/crud-factory";
import { obterSaudeLoja, type SaudeLojaResultado } from "@/modules/metricas/application/saude-loja.service";
import { obterAtendimento, type AtendimentoResumo } from "@/modules/metricas/application/atendimento.service";
import { obterPosVenda, type PosVendaResultado } from "@/modules/metricas/application/pos-venda.service";
import {
  aprovarSugestao,
  listarInsights,
  listarSugestoes,
  rejeitarSugestao,
} from "@/modules/ai/application/ai.service";

/** Mesma régua da rota (/metricas é admin+gestor): a checagem no layout
 *  protege a navegação, esta protege a chamada direta da server action. */
const PERFIS = ["admin", "gestor"] as const;

const FiltrosSchema = z.object({
  inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  brandIds: z.array(z.string().uuid()).max(20).optional(),
});

export type MetricasFiltros = z.infer<typeof FiltrosSchema>;

const PublicacoesSchema = z.object({
  brandId: z.string().uuid(),
  inicio: z.string().date(),
  fim: z.string().date(),
});

export async function actionObterDesempenhoPublicacoes(
  filtros: z.infer<typeof PublicacoesSchema>,
): Promise<DesempenhoPublicacoesResultado> {
  const ctx = await getCrudContext();
  assertPerfil(ctx, ["admin", "gestor"]);
  return obterDesempenhoPublicacoes(ctx, PublicacoesSchema.parse(filtros));
}

export async function actionObterSaudeLoja(filtros: MetricasFiltros = {}): Promise<SaudeLojaResultado> {
  const ctx = await getCrudContext();
  assertPerfil(ctx, [...PERFIS]);
  return obterSaudeLoja(ctx, FiltrosSchema.parse(filtros));
}

/** Consulta separada do score porque o funil não depende de nenhum canal
 *  externo — ele pinta na hora, enquanto o score ainda espera o Mercado Livre. */
export async function actionObterAtendimento(filtros: MetricasFiltros = {}): Promise<AtendimentoResumo> {
  const ctx = await getCrudContext();
  assertPerfil(ctx, [...PERFIS]);
  const { inicio, fim, brandIds } = FiltrosSchema.parse(filtros);
  const janela = resolverJanela(inicio, fim);
  return obterAtendimento(ctx, { ...janela, brandIds });
}

export async function actionObterPosVenda(filtros: MetricasFiltros = {}): Promise<PosVendaResultado> {
  const ctx = await getCrudContext();
  assertPerfil(ctx, [...PERFIS]);
  const { inicio, fim, brandIds } = FiltrosSchema.parse(filtros);
  return obterPosVenda(ctx, { ...resolverJanela(inicio, fim), brandIds });
}

/* ── Recomendações ───────────────────────────────────────────────
   Insights de funil e sugestões de campanha vieram da antiga página de
   Relatórios e continuam aqui — uma métrica sem "e daí?" é um número
   bonito e inerte. O portão de aprovação humana antes de qualquer
   disparo é o motivo de essas ações existirem: nenhuma campanha sai
   sem alguém clicar em aprovar. */

export async function actionListarInsights() {
  const ctx = await getCrudContext();
  assertPerfil(ctx, [...PERFIS]);
  return listarInsights(ctx.orgId);
}

export async function actionListarSugestoes() {
  const ctx = await getCrudContext();
  assertPerfil(ctx, [...PERFIS]);
  return listarSugestoes(ctx.orgId);
}

export async function actionAprovarSugestao(sugestaoId: string) {
  const ctx = await getCrudContext();
  assertPerfil(ctx, [...PERFIS]);
  const id = z.string().uuid().parse(sugestaoId);
  if (!ctx.userId) throw new Error("Usuário não identificado.");
  await aprovarSugestao(ctx.orgId, id, ctx.userId);
}

export async function actionRejeitarSugestao(sugestaoId: string, motivo = "Rejeitado pelo operador") {
  const ctx = await getCrudContext();
  assertPerfil(ctx, [...PERFIS]);
  const id = z.string().uuid().parse(sugestaoId);
  await rejeitarSugestao(ctx.orgId, id, z.string().trim().min(3).max(500).parse(motivo));
}

function resolverJanela(inicio?: string, fim?: string) {
  if (inicio && fim) {
    const [ai, mi, di] = inicio.split("-").map(Number);
    const [af, mf, df] = fim.split("-").map(Number);
    return {
      inicio: new Date(ai, mi - 1, di),
      fim: new Date(af, mf - 1, df, 23, 59, 59, 999),
    };
  }
  const agora = new Date();
  const trintaDiasAtras = new Date(agora);
  trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 29);
  trintaDiasAtras.setHours(0, 0, 0, 0);
  return { inicio: trintaDiasAtras, fim: agora };
}
