"use server";

import { getCrudContext } from "@/shared/lib/get-crud-context";
import { obterDashboardData } from "@/modules/relatorios/application/dashboard.service";

export async function actionObterDashboardData() {
  const ctx = await getCrudContext();
  return obterDashboardData(ctx);
}
