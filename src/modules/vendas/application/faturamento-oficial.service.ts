import "server-only";

import { and, eq, inArray, ne } from "drizzle-orm";
import type { CrudContext } from "@/shared/lib/crud-factory";
import { assertPerfil } from "@/shared/lib/crud-factory";
import { brand, channelAccount } from "@/shared/lib/db/schema";
import { isBrandSlug, type BrandSlug } from "@/shared/config/brands";
import { criarMLProvider } from "@/modules/canais/infrastructure/mercadolivre.provider";
import { criarShopeeProvider } from "@/modules/canais/infrastructure/shopee.provider";
import { criarTikTokShopProvider } from "@/modules/canais/infrastructure/tiktokshop.provider";
import { periodoDesempenhoML } from "../domain/desempenho-mercadolivre";
import { consolidarDesempenho, periodoAnteriorDesempenho, type BaseDesempenhoCanal, type DesempenhoCanal } from "../domain/desempenho-canal";

export type FaturamentoOficialCanal =
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
      desempenho?: DesempenhoCanal;
    }
  | { status: "indisponivel"; mensagem: string }
  | { status: "nao_aplicavel"; mensagem: string };

const MAX_INTERVALO_MS = 31 * 24 * 60 * 60 * 1000;
const ESPERA_NOVA_TENTATIVA_MS = 750;

type ResumoOficial = {
  faturamento: number;
  pedidosValidos: number;
  canceladosValor: number;
  canceladosQtd: number;
  totalBruto: number;
  totalPedidos: number;
  desempenho?: BaseDesempenhoCanal;
  desempenhoAnterior?: BaseDesempenhoCanal | null;
};

async function consultarFaturamentoOficial(
  ctx: CrudContext,
  filtros: { brandIds?: string[]; inicio?: Date; fim?: Date },
  canal: "mercadolivre" | "shopee" | "tiktokshop",
  resumir: (brandSlug: BrandSlug, inicio: Date, fim: Date, agora: Date) => Promise<ResumoOficial>,
): Promise<FaturamentoOficialCanal> {
  assertPerfil(ctx, ["admin", "gestor", "vendedor"]);
  const nomeComArtigo = canal === "mercadolivre" ? "o Mercado Livre" : canal === "shopee" ? "a Shopee" : "o TikTok Shop";

  if (!filtros.inicio || !filtros.fim) {
    return { status: "nao_aplicavel", mensagem: "Selecione as datas de início e fim." };
  }
  if (!Number.isFinite(filtros.inicio.getTime()) || !Number.isFinite(filtros.fim.getTime()) || filtros.fim.getTime() <= filtros.inicio.getTime()) {
    return { status: "nao_aplicavel", mensagem: "O período selecionado é inválido." };
  }
  if (filtros.fim.getTime() - filtros.inicio.getTime() > MAX_INTERVALO_MS) {
    return { status: "indisponivel", mensagem: "A consulta ao vivo aceita períodos de até 31 dias." };
  }

  const condicoes = [
    eq(channelAccount.orgId, ctx.orgId),
    eq(channelAccount.tipo, canal),
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
    return { status: "indisponivel", mensagem: `Nenhuma conta ativa d${nomeComArtigo} foi encontrada neste recorte.` };
  }
  if (contas.some((conta) => !isBrandSlug(conta.brandSlug))) {
    return { status: "indisponivel", mensagem: `Há uma empresa sem configuração válida para consultar ${nomeComArtigo}.` };
  }
  const contasValidas = contas as Array<{ brandSlug: BrandSlug }>;
  const agora = new Date();
  if (filtros.inicio > agora) return { status: "nao_aplicavel", mensagem: "Selecione um período que já tenha começado." };

  try {
    const resumos = await Promise.all(contasValidas.map(async (conta) => {
      try {
        return await resumir(conta.brandSlug, filtros.inicio!, filtros.fim!, agora);
      } catch (primeiroErro) {
        console.warn(`[vendas] primeira consulta oficial d${nomeComArtigo} falhou; tentando novamente`, primeiroErro);
        await new Promise((resolve) => setTimeout(resolve, ESPERA_NOVA_TENTATIVA_MS));
        return resumir(conta.brandSlug, filtros.inicio!, filtros.fim!, agora);
      }
    }));

    const somarCentavos = (campo: "faturamento" | "canceladosValor" | "totalBruto") => (
      resumos.reduce((total, resumo) => total + Math.round(resumo[campo] * 100), 0) / 100
    );
    let desempenho: DesempenhoCanal | undefined;
    if (resumos.every((resumo) => resumo.desempenho)) {
      const atual = consolidarDesempenho(resumos.map((resumo) => resumo.desempenho!));
      const anterior = resumos.every((resumo) => resumo.desempenhoAnterior)
        ? consolidarDesempenho(resumos.map((resumo) => resumo.desempenhoAnterior!)) : null;
      const periodo = canal === "mercadolivre" ? periodoDesempenhoML(filtros.inicio, filtros.fim) : { inicio: filtros.inicio, fim: filtros.fim };
      const periodoAnterior = periodoAnteriorDesempenho(periodo.inicio, periodo.fim);
      const avisos: string[] = [];
      if (canal === "shopee") avisos.push("A integração atual da Shopee não fornece visitas da loja por período. Visitas e conversão ficam indisponíveis; não usamos cliques de anúncios ou visualizações acumuladas como substitutos.");
      else if (atual.visitas === null) avisos.push("Visitas indisponíveis em uma ou mais contas. A conversão também fica indisponível; os pedidos continuam atualizados.");
      if (atual.unidadesVendidas === null) avisos.push("A API não informou todas as quantidades de itens. Unidades e preço médio por unidade ficam indisponíveis.");
      if (!anterior) avisos.push("Não foi possível consultar todas as contas no período anterior. A comparação está indisponível.");
      else if ((canal === "mercadolivre" && anterior.visitas === null) || anterior.unidadesVendidas === null) avisos.push("Alguns dados do período anterior estão indisponíveis. A comparação aparece somente nos indicadores completos.");
      if (periodo.fim > agora) avisos.push("O período atual ainda está em andamento. A comparação usa dias completos do período anterior e pode mudar até o fechamento.");
      desempenho = { atual, anterior, periodo: { inicio: periodo.inicio.toISOString(), fim: periodo.fim.toISOString() }, periodoAnterior: { inicio: periodoAnterior.inicio.toISOString(), fim: periodoAnterior.fim.toISOString() }, avisos };
    }

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
      ...(desempenho ? { desempenho } : {}),
    };
  } catch (erro) {
    console.error(`[vendas] falha ao consultar faturamento oficial d${nomeComArtigo}`, erro);
    return { status: "indisponivel", mensagem: `${nomeComArtigo[0].toUpperCase()}${nomeComArtigo.slice(1)} não respondeu à consulta ao vivo. Tente novamente em instantes.` };
  }
}

export function consultarFaturamentoOficialMercadoLivre(
  ctx: CrudContext,
  filtros: { brandIds?: string[]; inicio?: Date; fim?: Date },
): Promise<FaturamentoOficialCanal> {
  return consultarFaturamentoOficial(ctx, filtros, "mercadolivre", async (brandSlug, inicio, fim, agora) => {
    const provider = await criarMLProvider(brandSlug);
    const periodo = periodoAnteriorDesempenho(inicio, fim);
    const atual = await provider.resumirFaturamentoOficial(inicio, fim, true, agora);
    // Falha histórica não invalida os dados atuais; nunca comparar só parte das contas.
    const anterior = await provider.resumirFaturamentoOficial(periodo.inicio, periodo.fim, true, agora).catch(() => null);
    return { ...atual, desempenhoAnterior: anterior?.desempenho ?? null };
  });
}

export function consultarFaturamentoOficialShopee(
  ctx: CrudContext,
  filtros: { brandIds?: string[]; inicio?: Date; fim?: Date },
): Promise<FaturamentoOficialCanal> {
  return consultarFaturamentoOficial(ctx, filtros, "shopee", async (brandSlug, inicio, fim, agora) => {
    const provider = await criarShopeeProvider(brandSlug);
    const periodo = periodoAnteriorDesempenho(inicio, fim);
    const atual = await provider.resumirFaturamentoOficial(inicio, fim, true, agora);
    const anterior = await provider.resumirFaturamentoOficial(periodo.inicio, periodo.fim, true, agora).catch(() => null);
    return { ...atual, desempenhoAnterior: anterior?.desempenho ?? null };
  });
}

export function consultarFaturamentoOficialTikTokShop(
  ctx: CrudContext,
  filtros: { brandIds?: string[]; inicio?: Date; fim?: Date },
): Promise<FaturamentoOficialCanal> {
  return consultarFaturamentoOficial(ctx, filtros, "tiktokshop", async (brandSlug, inicio, fim) => {
    const provider = await criarTikTokShopProvider(brandSlug);
    return provider.resumirFaturamentoOficial(inicio, fim);
  });
}
