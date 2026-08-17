"use server";

import { z } from "zod";
import { unstable_cache } from "next/cache";
import { getCrudContext } from "@/shared/lib/get-crud-context";
import {
  obterDashboardData,
  type DashboardFilters,
} from "@/modules/metricas/application/dashboard.service";
import {
  listarMensagensReclamacao,
  obterReclamacoesAbertas,
  responderReclamacao,
} from "@/modules/metricas/application/reclamacoes.service";

export async function actionObterDashboardData(filters?: DashboardFilters) {
  const ctx = await getCrudContext();
  return obterDashboardData(ctx, filters);
}

// Separada do painel de propósito: consulta a API do Mercado Livre e é bem mais
// lenta que as queries locais. Carregando à parte, o painel pinta na hora e só
// o card de reclamações fica em skeleton.
//
// Cacheada por 90s por org: cada visita batia de novo na API do ML, que é o
// gargalo real do carregamento do mosaico. Reclamação aberta não muda a cada
// segundo — vale a pena servir do cache em vez de esperar o ML de novo.
export async function actionObterReclamacoes() {
  const ctx = await getCrudContext();
  const obterComCache = unstable_cache(
    () => obterReclamacoesAbertas(ctx),
    ["metricas-reclamacoes", ctx.orgId],
    { revalidate: 90, tags: [`reclamacoes-${ctx.orgId}`] },
  );
  return obterComCache();
}

export async function actionListarMensagensReclamacao(marca: string, claimId: string) {
  const ctx = await getCrudContext();
  z.string().min(1).parse(marca);
  z.string().regex(/^\d+$/).parse(claimId);
  return listarMensagensReclamacao(ctx, marca, claimId);
}

export async function actionResponderReclamacao(
  marca: string,
  claimId: string,
  mensagem: string,
  emMediacao: boolean,
) {
  const ctx = await getCrudContext();
  z.string().min(1).parse(marca);
  z.string().regex(/^\d+$/).parse(claimId);
  z.string().trim().min(1).max(2000).parse(mensagem);
  await responderReclamacao(ctx, marca, claimId, mensagem.trim(), emMediacao);
}
