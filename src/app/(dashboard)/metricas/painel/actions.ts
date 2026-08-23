"use server";

import { getCrudContext } from "@/shared/lib/get-crud-context";
import {
  obterDashboardData,
  type DashboardFilters,
} from "@/modules/metricas/application/dashboard.service";

export async function actionObterDashboardData(filters?: DashboardFilters) {
  const ctx = await getCrudContext();
  return obterDashboardData(ctx, filters);
}
