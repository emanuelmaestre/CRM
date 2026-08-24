import { and, count, desc, eq, gte } from "drizzle-orm";
import { startOfDay, subDays, startOfMonth } from "date-fns";
import type { CrudContext } from "@/shared/lib/crud-factory";
import { shopeeApiCall } from "@/shared/lib/db/schema";

/** Quantidade de chamadas feitas via shopeeFetch — provider, webhook e
 *  renovação de token, tudo que sai pro proxy de IP fixo (Fixie), que é
 *  limitado por mês. Existe pra dar visibilidade da cota antes dela estourar
 *  de novo (ver Configurações > Uso da API Shopee). */
export async function obterUsoApiShopee(ctx: CrudContext): Promise<{
  hoje: number;
  ultimos7Dias: number;
  esteMes: number;
  porCaminho: Array<{ caminho: string; total: number }>;
}> {
  const agora = new Date();
  const inicioHoje = startOfDay(agora);
  const inicio7Dias = subDays(inicioHoje, 6);
  const inicioMes = startOfMonth(agora);

  const [hoje, ultimos7Dias, esteMes, porCaminho] = await Promise.all([
    ctx.db
      .select({ total: count() })
      .from(shopeeApiCall)
      .where(and(eq(shopeeApiCall.orgId, ctx.orgId), gte(shopeeApiCall.criadoEm, inicioHoje)))
      .then((rows) => rows[0]?.total ?? 0),
    ctx.db
      .select({ total: count() })
      .from(shopeeApiCall)
      .where(and(eq(shopeeApiCall.orgId, ctx.orgId), gte(shopeeApiCall.criadoEm, inicio7Dias)))
      .then((rows) => rows[0]?.total ?? 0),
    ctx.db
      .select({ total: count() })
      .from(shopeeApiCall)
      .where(and(eq(shopeeApiCall.orgId, ctx.orgId), gte(shopeeApiCall.criadoEm, inicioMes)))
      .then((rows) => rows[0]?.total ?? 0),
    ctx.db
      .select({ caminho: shopeeApiCall.caminho, total: count() })
      .from(shopeeApiCall)
      .where(and(eq(shopeeApiCall.orgId, ctx.orgId), gte(shopeeApiCall.criadoEm, inicioMes)))
      .groupBy(shopeeApiCall.caminho)
      .orderBy(desc(count())),
  ]);

  return {
    hoje,
    ultimos7Dias,
    esteMes,
    porCaminho: porCaminho.map((linha) => ({ caminho: linha.caminho, total: Number(linha.total) })),
  };
}
