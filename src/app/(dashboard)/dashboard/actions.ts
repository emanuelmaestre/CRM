"use server";

import { getCrudContext } from "@/shared/lib/get-crud-context";
import {
  obterDashboardData,
  type DashboardFilters,
} from "@/modules/relatorios/application/dashboard.service";
import { obterReclamacoesAbertas } from "@/modules/relatorios/application/reclamacoes.service";

export async function actionObterDashboardData(filters?: DashboardFilters) {
  const ctx = await getCrudContext();
  return obterDashboardData(ctx, filters);
}

// Separada do painel de propósito: consulta a API do Mercado Livre e é bem mais
// lenta que as queries locais. Carregando à parte, o painel pinta na hora e só
// o card de reclamações fica em skeleton.
export async function actionObterReclamacoes() {
  const ctx = await getCrudContext();
  return obterReclamacoesAbertas(ctx);
}
