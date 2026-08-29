import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { startOfDay, subDays, startOfMonth } from "date-fns";
import type { CrudContext } from "@/shared/lib/crud-factory";
import { shopeeApiCall } from "@/shared/lib/db/schema";

/** Quantidade de chamadas feitas via shopeeFetch — provider, webhook e
 *  renovação de token, tudo que sai pro proxy de IP fixo (Webshare), que é
 *  limitado por mês. Existe pra dar visibilidade da cota antes dela estourar
 *  de novo (ver Configurações > Uso da API Shopee). */
export async function obterUsoApiShopee(ctx: CrudContext): Promise<{
  hoje: number;
  ultimos7Dias: number;
  esteMes: number;
  bytesHoje: number;
  bytesEsteMes: number;
  percentualFranquia: number;
  porCaminho: Array<{ caminho: string; total: number; bytes: number }>;
}> {
  const agora = new Date();
  const inicioHoje = startOfDay(agora);
  const inicio7Dias = subDays(inicioHoje, 6);
  const inicioMes = startOfMonth(agora);

  const uso = {
    total: count(),
    bytes: sql<number>`coalesce(sum(coalesce(${shopeeApiCall.requestBytes}, 0) + coalesce(${shopeeApiCall.responseBytes}, 0)), 0)`,
  };
  const [hoje, ultimos7Dias, esteMes, porCaminho] = await Promise.all([
    ctx.db
      .select(uso)
      .from(shopeeApiCall)
      .where(and(eq(shopeeApiCall.orgId, ctx.orgId), gte(shopeeApiCall.criadoEm, inicioHoje)))
      .then((rows) => rows[0] ?? { total: 0, bytes: 0 }),
    ctx.db
      .select(uso)
      .from(shopeeApiCall)
      .where(and(eq(shopeeApiCall.orgId, ctx.orgId), gte(shopeeApiCall.criadoEm, inicio7Dias)))
      .then((rows) => rows[0] ?? { total: 0, bytes: 0 }),
    ctx.db
      .select(uso)
      .from(shopeeApiCall)
      .where(and(eq(shopeeApiCall.orgId, ctx.orgId), gte(shopeeApiCall.criadoEm, inicioMes)))
      .then((rows) => rows[0] ?? { total: 0, bytes: 0 }),
    ctx.db
      .select({ caminho: shopeeApiCall.caminho, ...uso })
      .from(shopeeApiCall)
      .where(and(eq(shopeeApiCall.orgId, ctx.orgId), gte(shopeeApiCall.criadoEm, inicioMes)))
      .groupBy(shopeeApiCall.caminho)
      .orderBy(desc(count())),
  ]);

  return {
    hoje: Number(hoje.total),
    ultimos7Dias: Number(ultimos7Dias.total),
    esteMes: Number(esteMes.total),
    bytesHoje: Number(hoje.bytes),
    bytesEsteMes: Number(esteMes.bytes),
    percentualFranquia: Math.min(100, Math.round((Number(esteMes.bytes) / (1024 ** 3)) * 10_000) / 100),
    porCaminho: porCaminho.map((linha) => ({
      caminho: linha.caminho,
      total: Number(linha.total),
      bytes: Number(linha.bytes),
    })),
  };
}
