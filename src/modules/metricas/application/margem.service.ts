import { and, eq, gte, inArray, isNotNull, lte, ne, sql } from "drizzle-orm";
import type { CrudContext } from "@/shared/lib/crud-factory";
import { pedido, pedidoItem } from "@/shared/lib/db/schema";

/* ── Margem por marca (comissão do Mercado Livre) ────────────────
   `pedido_item.taxa_marketplace` vem do `sale_fee` que o Mercado Livre já
   manda em cada item do pedido — grátis, sem chamada nova (ver
   mercadolivre.provider.ts). Só existe para pedidos do ML ingeridos depois
   desta coluna nascer; pedidos mais antigos e os demais canais (que não
   expõem essa taxa) ficam de fora do cálculo, não entram como "comissão
   zero" — isso inflaria a margem de quem simplesmente não tem o dado.
   `coberturaPercentual` existe para a tela nunca esconder isso: uma margem
   calculada sobre 20% da receita não pode aparecer com a mesma confiança que
   uma calculada sobre 90%. */

export interface MargemMarca {
  brandId: string;
  /** Receita dos itens que têm taxa de marketplace conhecida — não é a
   *  receita total da marca (essa já existe em `SaudeMarca.faturamento`). */
  receitaComTaxaConhecida: number;
  comissaoTotal: number;
  margemLiquida: number;
  /** 0–100. Null quando não há nenhum item com taxa conhecida no período. */
  margemPercentual: number | null;
  /** 0–100: quanto da receita total da marca (não só a com taxa conhecida)
   *  este cálculo cobre. Baixa cobertura é o sinal de "não confie demais
   *  neste número ainda". */
  coberturaPercentual: number;
}

function paraNumero(valor: unknown): number {
  const parsed = Number(valor ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function obterMargemPorMarca(
  ctx: CrudContext,
  opcoes: { inicio: Date; fim: Date; brandIds: string[]; receitaTotalPorMarca: Map<string, number> },
): Promise<Map<string, MargemMarca>> {
  if (opcoes.brandIds.length === 0) return new Map();

  const condicoesBase = [
    eq(pedido.orgId, ctx.orgId),
    inArray(pedido.brandId, opcoes.brandIds),
    gte(pedido.createdAt, opcoes.inicio),
    lte(pedido.createdAt, opcoes.fim),
    ne(pedido.status, "cancelado"),
    ne(pedido.status, "devolvido"),
  ];

  const linhas = await ctx.db
    .select({
      brandId: pedido.brandId,
      receita: sql<string>`sum(${pedidoItem.quantidade} * ${pedidoItem.precoUnitario})`,
      comissao: sql<string>`sum(${pedidoItem.taxaMarketplace})`,
    })
    .from(pedidoItem)
    .innerJoin(pedido, eq(pedido.id, pedidoItem.pedidoId))
    .where(and(...condicoesBase, isNotNull(pedidoItem.taxaMarketplace)))
    .groupBy(pedido.brandId);

  const resultado = new Map<string, MargemMarca>();
  for (const linha of linhas) {
    const receita = paraNumero(linha.receita);
    const comissao = paraNumero(linha.comissao);
    const receitaTotal = opcoes.receitaTotalPorMarca.get(linha.brandId) ?? 0;
    resultado.set(linha.brandId, {
      brandId: linha.brandId,
      receitaComTaxaConhecida: receita,
      comissaoTotal: comissao,
      margemLiquida: receita - comissao,
      margemPercentual: receita > 0 ? Math.round(((receita - comissao) / receita) * 1000) / 10 : null,
      coberturaPercentual: receitaTotal > 0 ? Math.round((receita / receitaTotal) * 1000) / 10 : 0,
    });
  }
  return resultado;
}
