import { and, eq } from "drizzle-orm";
import type { CrudContext } from "@/shared/lib/crud-factory";
import { brand } from "@/shared/lib/db/schema";
import { criarMLProvider } from "@/modules/canais/infrastructure/mercadolivre.provider";
import { criarMLAdsProvider, type MLAnuncio } from "@/modules/anuncios/infrastructure/mercadolivre-ads.provider";
import { isBrandSlug } from "@/shared/config/brands";

export const PUBLICACOES_CACHE_TAG = "metricas-publicacoes";

export type SituacaoQualidade = "disponivel" | "nao_aplicavel" | "indisponivel" | "nao_consultada";

export interface DesempenhoPublicacao {
  itemId: string;
  titulo: string;
  status: string | null;
  impressoes: number;
  cliques: number;
  unidadesAtribuidas: number;
  ctr: number | null;
  cvr: number | null;
  investimento: number;
  receita: number;
  qualidade: number | null;
  nivelQualidade: string | null;
  qualidadeStatus: SituacaoQualidade;
  pendencias: string[];
  /** Data de publicação real do anúncio (`date_created` do item na API de
   *  Itens do ML) — não vem da API de Product Ads, é buscada à parte só
   *  para os itens exibidos. Null quando a consulta falha ou o item não
   *  tem a data disponível. */
  dataCriacao: string | null;
}

export interface ResumoDesempenhoPublicacoes {
  totalPublicacoes: number;
  comVeiculacao: number;
  semVeiculacao: number;
  investimento: number;
  receita: number;
  unidadesAtribuidas: number;
}

export interface DesempenhoPublicacoesResultado {
  /** Até 20 anúncios com veiculação, ordenados pelo resultado do período. */
  itens: DesempenhoPublicacao[];
  /** Amostra compacta de até 20 anúncios realmente zerados no período. */
  semVeiculacao: DesempenhoPublicacao[];
  resumo: ResumoDesempenhoPublicacoes;
  parcial: boolean;
  periodo: { inicio: string; fim: string };
}

const LIMITE_EXIBICAO = 20;

function numero(valor: unknown): number {
  const resultado = Number(valor ?? 0);
  return Number.isFinite(resultado) ? resultado : 0;
}

function dataDoPeriodo(iso: string): Date {
  return new Date(`${iso}T12:00:00-03:00`);
}

function prioridadeStatus(status: string | null): number {
  if (status === "active") return 3;
  if (status === "hold") return 2;
  if (status === "idle") return 1;
  return 0;
}

/** Um item pode participar de mais de uma campanha. A API devolve uma linha
 * por campanha, então consolidamos pelo item antes de ordenar e exibir. */
function consolidarAnuncios(anuncios: MLAnuncio[]): DesempenhoPublicacao[] {
  const porItem = new Map<string, DesempenhoPublicacao>();

  for (const anuncio of anuncios) {
    const atual = porItem.get(anuncio.itemId) ?? {
      itemId: anuncio.itemId,
      titulo: anuncio.title ?? anuncio.itemId,
      status: anuncio.status,
      impressoes: 0,
      cliques: 0,
      unidadesAtribuidas: 0,
      ctr: null,
      cvr: null,
      investimento: 0,
      receita: 0,
      qualidade: null,
      nivelQualidade: null,
      qualidadeStatus: "nao_consultada" as const,
      pendencias: [],
      dataCriacao: null,
    };
    atual.titulo = anuncio.title ?? atual.titulo;
    if (prioridadeStatus(anuncio.status) > prioridadeStatus(atual.status)) atual.status = anuncio.status;
    atual.impressoes += numero(anuncio.metricas.prints);
    atual.cliques += numero(anuncio.metricas.clicks);
    atual.unidadesAtribuidas += numero(anuncio.metricas.units_quantity);
    atual.investimento += numero(anuncio.metricas.cost);
    atual.receita += numero(anuncio.metricas.total_amount);
    porItem.set(anuncio.itemId, atual);
  }

  return [...porItem.values()].map((item) => ({
    ...item,
    investimento: Math.round(item.investimento * 100) / 100,
    receita: Math.round(item.receita * 100) / 100,
    ctr: item.impressoes > 0 ? Math.round((item.cliques / item.impressoes) * 10_000) / 100 : null,
    cvr: item.cliques > 0 ? Math.round((item.unidadesAtribuidas / item.cliques) * 10_000) / 100 : null,
  }));
}

function teveVeiculacao(item: DesempenhoPublicacao): boolean {
  return item.impressoes > 0
    || item.cliques > 0
    || item.investimento > 0
    || item.receita > 0
    || item.unidadesAtribuidas > 0;
}

function ordenarPorResultado(a: DesempenhoPublicacao, b: DesempenhoPublicacao): number {
  return b.receita - a.receita
    || b.investimento - a.investimento
    || b.cliques - a.cliques
    || b.impressoes - a.impressoes
    || a.titulo.localeCompare(b.titulo, "pt-BR");
}

function resultadoVazio(filtros: { inicio: string; fim: string }): DesempenhoPublicacoesResultado {
  return {
    itens: [],
    semVeiculacao: [],
    resumo: { totalPublicacoes: 0, comVeiculacao: 0, semVeiculacao: 0, investimento: 0, receita: 0, unidadesAtribuidas: 0 },
    parcial: false,
    periodo: filtros,
  };
}

/** Só a contagem de publicações por marca — mesma chamada de listagem de
 *  `obterDesempenhoPublicacoes`, mas sem o loop de qualidade por item (que
 *  é caro e só faz sentido para os até 20 anúncios exibidos). Alimenta o
 *  número ao lado de cada pílula de marca, igual ao padrão usado em
 *  Avaliações/Estoque/Vendas/Clientes — só que ali o número vem de uma
 *  contagem barata no banco; aqui exige mesmo chamar a API do Mercado Livre,
 *  pois publicações patrocinadas não são persistidas localmente. */
export async function contarPublicacoesPorMarca(
  ctx: CrudContext,
  filtros: { brandIds: string[]; inicio: string; fim: string },
): Promise<Array<{ brandId: string; total: number }>> {
  const marcas = await ctx.db.select({ id: brand.id, slug: brand.slug }).from(brand).where(and(
    eq(brand.orgId, ctx.orgId), eq(brand.active, true),
  ));
  const alvo = marcas.filter((m) => filtros.brandIds.includes(m.id) && isBrandSlug(m.slug));

  const resultados = await Promise.allSettled(alvo.map(async (marca) => {
    const adsProvider = await criarMLAdsProvider(marca.slug as Parameters<typeof criarMLAdsProvider>[0]);
    const advertiser = await adsProvider.obterAdvertiser();
    const anuncios = await adsProvider.listarAnuncios(
      advertiser.advertiserId,
      advertiser.siteId,
      dataDoPeriodo(filtros.inicio),
      dataDoPeriodo(filtros.fim),
    );
    return { brandId: marca.id, total: new Set(anuncios.map((a) => a.itemId)).size };
  }));

  return alvo.map((marca, indice) => {
    const resultado = resultados[indice];
    return { brandId: marca.id, total: resultado.status === "fulfilled" ? resultado.value.total : 0 };
  });
}

export async function obterDesempenhoPublicacoes(
  ctx: CrudContext,
  filtros: { brandId: string; inicio: string; fim: string },
): Promise<DesempenhoPublicacoesResultado> {
  const marca = await ctx.db.select({ slug: brand.slug }).from(brand).where(and(
    eq(brand.orgId, ctx.orgId), eq(brand.id, filtros.brandId), eq(brand.active, true),
  )).then((rows) => rows[0]);
  if (!marca || !isBrandSlug(marca.slug)) return resultadoVazio(filtros);

  // A API aceita o intervalo completo e devolve as métricas agregadas por
  // campanha. Assim o último snapshot diário não se passa pelo período todo.
  const adsProvider = await criarMLAdsProvider(marca.slug);
  const advertiser = await adsProvider.obterAdvertiser();
  const anuncios = consolidarAnuncios(await adsProvider.listarAnuncios(
    advertiser.advertiserId,
    advertiser.siteId,
    dataDoPeriodo(filtros.inicio),
    dataDoPeriodo(filtros.fim),
  ));

  const comVeiculacao = anuncios.filter(teveVeiculacao).sort(ordenarPorResultado);
  const semVeiculacao = anuncios.filter((item) => !teveVeiculacao(item))
    .sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"));
  const exibidos = comVeiculacao.slice(0, LIMITE_EXIBICAO);

  // Qualidade e data de criação pertencem à API de Itens, não à de Product
  // Ads. Consultar apenas os itens que aparecem evita centenas de chamadas
  // para anúncios zerados.
  const publicacoesProvider = await criarMLProvider(marca.slug);
  const [performances, datasCriacao] = await Promise.all([
    Promise.allSettled(exibidos.map((item) => publicacoesProvider.obterPerformanceItem(item.itemId))),
    publicacoesProvider.consultarDataCriacaoAnuncios(exibidos.map((item) => item.itemId)).catch(() => ({} as Record<string, string | null>)),
  ]);
  const itens = exibidos.map((item, indice) => {
    const performance = performances[indice];
    const dataCriacao = datasCriacao[item.itemId] ?? null;
    if (performance.status === "fulfilled") {
      return {
        ...item,
        qualidade: performance.value.score,
        nivelQualidade: performance.value.nivel,
        qualidadeStatus: "disponivel" as const,
        pendencias: performance.value.pendencias,
        dataCriacao,
      };
    }
    const erro = String(performance.reason);
    return {
      ...item,
      qualidadeStatus: erro.includes("HTTP 400") ? "nao_aplicavel" as const : "indisponivel" as const,
      dataCriacao,
    };
  });

  return {
    periodo: { inicio: filtros.inicio, fim: filtros.fim },
    parcial: performances.some((item) => item.status === "rejected"),
    itens,
    semVeiculacao: semVeiculacao.slice(0, LIMITE_EXIBICAO),
    resumo: {
      totalPublicacoes: anuncios.length,
      comVeiculacao: comVeiculacao.length,
      semVeiculacao: semVeiculacao.length,
      investimento: Math.round(anuncios.reduce((soma, item) => soma + item.investimento, 0) * 100) / 100,
      receita: Math.round(anuncios.reduce((soma, item) => soma + item.receita, 0) * 100) / 100,
      unidadesAtribuidas: anuncios.reduce((soma, item) => soma + item.unidadesAtribuidas, 0),
    },
  };
}
