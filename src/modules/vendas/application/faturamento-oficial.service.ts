import "server-only";

import { and, eq, inArray, ne } from "drizzle-orm";
import type { CrudContext } from "@/shared/lib/crud-factory";
import { assertPerfil } from "@/shared/lib/crud-factory";
import { brand, channelAccount } from "@/shared/lib/db/schema";
import { isBrandSlug, type BrandSlug } from "@/shared/config/brands";
import { criarMLProvider } from "@/modules/canais/infrastructure/mercadolivre.provider";

export type FaturamentoOficialMercadoLivre =
  | {
      status: "ok";
      faturamento: number;
      pedidosValidos: number;
      canceladosValor: number;
      canceladosQtd: number;
      totalBruto: number;
      totalPedidos: number;
      contasConsultadas: number;
      consultadoEm: string;
    }
  | { status: "indisponivel"; mensagem: string }
  | { status: "nao_aplicavel"; mensagem: string };

const MAX_INTERVALO_MS = 31 * 24 * 60 * 60 * 1000;

export async function consultarFaturamentoOficialMercadoLivre(
  ctx: CrudContext,
  filtros: { brandIds?: string[]; inicio?: Date; fim?: Date },
): Promise<FaturamentoOficialMercadoLivre> {
  assertPerfil(ctx, ["admin", "gestor", "vendedor"]);

  if (!filtros.inicio || !filtros.fim) {
    return { status: "nao_aplicavel", mensagem: "Selecione as datas de início e fim." };
  }
  if (filtros.fim.getTime() <= filtros.inicio.getTime()) {
    return { status: "nao_aplicavel", mensagem: "O período selecionado é inválido." };
  }
  if (filtros.fim.getTime() - filtros.inicio.getTime() > MAX_INTERVALO_MS) {
    return { status: "indisponivel", mensagem: "A consulta ao vivo aceita períodos de até 31 dias." };
  }

  const condicoes = [
    eq(channelAccount.orgId, ctx.orgId),
    eq(channelAccount.tipo, "mercadolivre"),
    ne(channelAccount.status, "desconectado"),
    eq(brand.orgId, ctx.orgId),
    eq(brand.active, true),
  ];
  if (filtros.brandIds?.length) condicoes.push(inArray(brand.id, filtros.brandIds));

  const contas = await ctx.db
    .select({ brandSlug: brand.slug })
    .from(channelAccount)
    .innerJoin(brand, eq(brand.id, channelAccount.brandId))
    .where(and(...condicoes));

  if (contas.length === 0) {
    return { status: "indisponivel", mensagem: "Nenhuma conta ativa do Mercado Livre foi encontrada neste recorte." };
  }
  if (contas.some((conta) => !isBrandSlug(conta.brandSlug))) {
    return { status: "indisponivel", mensagem: "Há uma empresa sem configuração válida para consultar o Mercado Livre." };
  }
  const contasValidas = contas as Array<{ brandSlug: BrandSlug }>;

  try {
    const resumos = await Promise.all(contasValidas.map(async (conta) => {
      const provider = await criarMLProvider(conta.brandSlug);
      return provider.resumirFaturamentoOficial(filtros.inicio!, filtros.fim!);
    }));

    const somarCentavos = (campo: "faturamento" | "canceladosValor" | "totalBruto") => (
      resumos.reduce((total, resumo) => total + Math.round(resumo[campo] * 100), 0) / 100
    );

    return {
      status: "ok",
      faturamento: somarCentavos("faturamento"),
      pedidosValidos: resumos.reduce((total, resumo) => total + resumo.pedidosValidos, 0),
      canceladosValor: somarCentavos("canceladosValor"),
      canceladosQtd: resumos.reduce((total, resumo) => total + resumo.canceladosQtd, 0),
      totalBruto: somarCentavos("totalBruto"),
      totalPedidos: resumos.reduce((total, resumo) => total + resumo.totalPedidos, 0),
      contasConsultadas: resumos.length,
      consultadoEm: new Date().toISOString(),
    };
  } catch (erro) {
    console.error("[vendas] falha ao consultar faturamento oficial do Mercado Livre", erro);
    return { status: "indisponivel", mensagem: "O Mercado Livre não respondeu à consulta ao vivo. Tente novamente em instantes." };
  }
}
