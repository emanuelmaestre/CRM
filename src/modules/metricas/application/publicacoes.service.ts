import { and, eq, gte, lte } from "drizzle-orm";
import type { CrudContext } from "@/shared/lib/crud-factory";
import { adsAnuncioSnapshot, brand } from "@/shared/lib/db/schema";
import { criarMLProvider } from "@/modules/canais/infrastructure/mercadolivre.provider";
import { criarMLAdsProvider, type MLAnuncio } from "@/modules/anuncios/infrastructure/mercadolivre-ads.provider";
import { PLATAFORMA_ANUNCIOS_PADRAO, type PlataformaAnuncios } from "@/modules/anuncios/domain/plataformas";
import { isBrandSlug } from "@/shared/config/brands";

export const PUBLICACOES_CACHE_TAG = "metricas-publicacoes";

export type SituacaoQualidade = "disponivel" | "nao_aplicavel" | "indisponivel" | "nao_consultada";

export interface DesempenhoPublicacao {
  /** Canal dono da publicação. Vai por LINHA, não só no resultado: com os
   *  dois canais ligados a grade mistura Mercado Livre e Shopee, e o mesmo
   *  produto pode aparecer nos dois — sem dizer de qual canal é cada número,
   *  as duas linhas se leem como duplicata. */
  canal: PlataformaAnuncios;
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
  canal: PlataformaAnuncios;
  /** Quando estes números foram coletados, para o canal que é lido do banco
   *  em vez de consultado ao vivo. Null no Mercado Livre, onde a consulta é
   *  feita na hora contra a API de Product Ads — a diferença precisa ficar
   *  visível, senão o número da Shopee se passa por "agora". */
  sincronizadoEm: string | null;
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

/** Mesma ideia da prioridade do Mercado Livre, com os estados que a Shopee
 *  devolve: um item em duas campanhas pode estar veiculando numa e parado na
 *  outra, e o selo do card deve mostrar o estado mais "vivo". */
function prioridadeStatusShopee(status: string | null): number {
  if (status === "ongoing") return 3;
  if (status === "paused") return 2;
  if (status === "ended") return 1;
  return 0;
}

/** A Shopee nomeia a segunda campanha do mesmo produto acrescentando " [2]"
 *  ao título (confirmado no banco: o mesmo item_id aparece com "[2]" e "[3]"
 *  em campanhas diferentes). Esse sufixo identifica a CAMPANHA; aqui a
 *  unidade é a publicação, então ele viraria um "[3]" solto no nome do
 *  produto, sem nada na tela que explicasse de onde saiu. */
function tituloSemMarcaDeCampanha(titulo: string): string {
  return titulo.replace(/s*[d+]$/, "");
}

/** Um item pode participar de mais de uma campanha. A API devolve uma linha
 * por campanha, então consolidamos pelo item antes de ordenar e exibir. */
function consolidarAnuncios(anuncios: MLAnuncio[]): DesempenhoPublicacao[] {
  const porItem = new Map<string, DesempenhoPublicacao>();

  for (const anuncio of anuncios) {
    const atual = porItem.get(anuncio.itemId) ?? {
      canal: "mercadolivre" as PlataformaAnuncios,
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

function resultadoVazio(
  filtros: { inicio: string; fim: string },
  canal: PlataformaAnuncios = PLATAFORMA_ANUNCIOS_PADRAO,
): DesempenhoPublicacoesResultado {
  return {
    canal,
    sincronizadoEm: null,
    itens: [],
    semVeiculacao: [],
    resumo: { totalPublicacoes: 0, comVeiculacao: 0, semVeiculacao: 0, investimento: 0, receita: 0, unidadesAtribuidas: 0 },
    parcial: false,
    periodo: filtros,
  };
}

/** Publicações da Shopee. Diferente do Mercado Livre, aqui NÃO se chama a
 *  API na hora: o job A32 já grava um snapshot diário por anúncio
 *  (`ads_anuncio_snapshot`, plataforma "shopee"), que é a mesma fonte de
 *  todo o módulo Publicidade. Consultar a Shopee ao vivo custaria uma
 *  varredura fatiada de 15 em 15 dias por trás de proxy, dentro de um card
 *  de painel — e devolveria o mesmo número, porque a Shopee só atualiza a
 *  medição algumas vezes ao dia. Em troca, o resultado carrega
 *  `sincronizadoEm` para a tela poder dizer de quando é o dado. */
async function obterDesempenhoPublicacoesShopee(
  ctx: CrudContext,
  filtros: { brandId: string; inicio: string; fim: string },
): Promise<DesempenhoPublicacoesResultado> {
  const linhas = await ctx.db
    .select()
    .from(adsAnuncioSnapshot)
    .where(and(
      eq(adsAnuncioSnapshot.orgId, ctx.orgId),
      eq(adsAnuncioSnapshot.brandId, filtros.brandId),
      eq(adsAnuncioSnapshot.plataforma, "shopee"),
      gte(adsAnuncioSnapshot.data, filtros.inicio),
      lte(adsAnuncioSnapshot.data, filtros.fim),
    ));

  if (linhas.length === 0) return resultadoVazio(filtros, "shopee");

  /* Um item aparece uma vez por campanha e por dia; a unidade do card é a
     publicação, então soma-se tudo por item — o mesmo que
     `consolidarAnuncios` faz com as linhas por campanha do Mercado Livre. */
  const porItem = new Map<string, DesempenhoPublicacao>();
  for (const linha of linhas) {
    const atual = porItem.get(linha.itemId) ?? {
      canal: "shopee" as PlataformaAnuncios,
      itemId: linha.itemId,
      titulo: linha.itemId,
      status: null as string | null,
      impressoes: 0,
      cliques: 0,
      unidadesAtribuidas: 0,
      ctr: null,
      cvr: null,
      investimento: 0,
      receita: 0,
      qualidade: null,
      nivelQualidade: null,
      /* A API de Ads da Shopee não devolve nota de qualidade nem lista de
         pendências do anúncio — é um conceito do Mercado Livre. "Não
         aplicável" é o estado certo: não é falha de consulta nem nota zero. */
      qualidadeStatus: "nao_aplicavel" as const,
      pendencias: [] as string[],
      dataCriacao: null as string | null,
    };
    if (linha.titulo) atual.titulo = tituloSemMarcaDeCampanha(linha.titulo);
    if (prioridadeStatusShopee(linha.status) > prioridadeStatusShopee(atual.status)) atual.status = linha.status;
    atual.impressoes += numero(linha.prints);
    atual.cliques += numero(linha.clicks);
    atual.unidadesAtribuidas += numero(linha.unitsQuantity);
    atual.investimento += numero(linha.cost);
    atual.receita += numero(linha.totalAmount);
    atual.dataCriacao = atual.dataCriacao ?? linha.anuncioCriadoEm?.toISOString() ?? null;
    porItem.set(linha.itemId, atual);
  }

  const anuncios = [...porItem.values()].map((item) => ({
    ...item,
    investimento: Math.round(item.investimento * 100) / 100,
    receita: Math.round(item.receita * 100) / 100,
    ctr: item.impressoes > 0 ? Math.round((item.cliques / item.impressoes) * 10_000) / 100 : null,
    cvr: item.cliques > 0 ? Math.round((item.unidadesAtribuidas / item.cliques) * 10_000) / 100 : null,
  }));

  const comVeiculacao = anuncios.filter(teveVeiculacao).sort(ordenarPorResultado);
  const semVeiculacao = anuncios.filter((item) => !teveVeiculacao(item))
    .sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"));

  const sincronizadoEm = linhas.reduce<Date | null>((maior, linha) => (
    !maior || linha.criadoEm > maior ? linha.criadoEm : maior
  ), null);

  return {
    canal: "shopee",
    sincronizadoEm: sincronizadoEm?.toISOString() ?? null,
    periodo: { inicio: filtros.inicio, fim: filtros.fim },
    parcial: false,
    itens: comVeiculacao.slice(0, LIMITE_EXIBICAO),
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

/** Caminho crítico do card: consulta apenas Product Ads e já devolve todas as
 * métricas principais. Qualidade, pendências e data pertencem a outra API e
 * são anexadas depois, sem segurar investimento, receita, cliques e vendas. */
export async function obterDesempenhoPublicacoesBase(
  ctx: CrudContext,
  filtros: { brandId: string; inicio: string; fim: string; canal?: PlataformaAnuncios },
): Promise<DesempenhoPublicacoesResultado> {
  const canal = filtros.canal ?? PLATAFORMA_ANUNCIOS_PADRAO;
  if (canal === "shopee") return obterDesempenhoPublicacoesShopee(ctx, filtros);

  const marca = await ctx.db.select({ slug: brand.slug }).from(brand).where(and(
    eq(brand.orgId, ctx.orgId), eq(brand.id, filtros.brandId), eq(brand.active, true),
  )).then((rows) => rows[0]);
  if (!marca || !isBrandSlug(marca.slug)) return resultadoVazio(filtros, canal);

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

  return {
    canal: "mercadolivre",
    // Consulta ao vivo na API de Product Ads: o dado é deste instante.
    sincronizadoEm: null,
    periodo: { inicio: filtros.inicio, fim: filtros.fim },
    parcial: false,
    itens: exibidos,
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

/** Segunda etapa progressiva: reaproveita a listagem já obtida do Product Ads
 * e consulta somente os detalhes dos itens efetivamente exibidos. */
export async function enriquecerDesempenhoPublicacoes(
  ctx: CrudContext,
  filtros: { brandId: string; inicio: string; fim: string; canal?: PlataformaAnuncios },
  base: DesempenhoPublicacoesResultado,
): Promise<DesempenhoPublicacoesResultado> {
  // Qualidade, pendências e data de publicação vêm da API de Itens do
  // Mercado Livre. A Shopee não tem equivalente: a base já sai completa e
  // marcada como "não aplicável", e chamar isto para ela seria consultar o
  // ML com um id que não é dele.
  if (base.canal !== "mercadolivre") return base;
  if (base.itens.length === 0) return base;

  const marca = await ctx.db.select({ slug: brand.slug }).from(brand).where(and(
    eq(brand.orgId, ctx.orgId), eq(brand.id, filtros.brandId), eq(brand.active, true),
  )).then((rows) => rows[0]);
  if (!marca || !isBrandSlug(marca.slug)) return base;

  // Qualidade e data de criação pertencem à API de Itens, não à de Product
  // Ads. Consultar apenas os itens que aparecem evita centenas de chamadas
  // para anúncios zerados.
  const publicacoesProvider = await criarMLProvider(marca.slug);
  const [performances, datasCriacao] = await Promise.all([
    Promise.allSettled(base.itens.map((item) => publicacoesProvider.obterPerformanceItem(item.itemId))),
    publicacoesProvider.consultarDataCriacaoAnuncios(base.itens.map((item) => item.itemId)).catch(() => ({} as Record<string, string | null>)),
  ]);
  const itens = base.itens.map((item, indice) => {
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
    ...base,
    parcial: performances.some((item) => item.status === "rejected"),
    itens,
  };
}

export async function obterDesempenhoPublicacoes(
  ctx: CrudContext,
  filtros: { brandId: string; inicio: string; fim: string; canal?: PlataformaAnuncios },
): Promise<DesempenhoPublicacoesResultado> {
  const base = await obterDesempenhoPublicacoesBase(ctx, filtros);
  return enriquecerDesempenhoPublicacoes(ctx, filtros, base);
}
