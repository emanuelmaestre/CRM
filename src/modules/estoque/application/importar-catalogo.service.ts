import { and, eq, isNull, sql } from "drizzle-orm";
import { assertPerfil, type CrudContext } from "@/shared/lib/crud-factory";
import { auditLog, brand, channelAccount, produto, produtoCanal, estoqueCanalSaldo } from "@/shared/lib/db/schema";
import { persistirEvento, despacharEvento } from "@/shared/events";
import { criarMLProvider } from "@/modules/canais/infrastructure/mercadolivre.provider";
import { criarShopeeProvider } from "@/modules/canais/infrastructure/shopee.provider";
import { isBrandSlug, type BrandSlug } from "@/shared/config/brands";

/** Cadastro manual de produto, um a um, não dá conta de um catálogo com
 *  centenas de anúncios — por isso o módulo de Estoque fica vazio pra quem
 *  já vende no Mercado Livre. Essa importação lê os anúncios ativos de cada
 *  conta conectada e cria o produto + o vínculo produto_canal automático
 *  pra quem ainda não tem: o saldo inicial vem do "available_quantity" do
 *  próprio anúncio, e a partir daí a baixa automática (A2) assume. Anúncio
 *  já mapeado conserva o cadastro, mas atualiza o saldo informado pelo canal. */
export interface ContaParaImportar {
  channelAccountId: string;
  brandId: string;
  brandSlug: BrandSlug;
}

/* ── Importação em fatias, para caber no tempo de um step ────────────
   `importarCatalogoConta*` percorre o catálogo inteiro numa chamada só. Isso
   funciona para uma marca pequena e falha em silêncio para uma grande: dentro
   de um `step.run` do Inngest, cada step é uma invocação HTTP com tempo
   limitado, e o step é morto no meio.

   Aconteceu em produção em 25/08/2026 — KARZI (16 produtos) concluiu em 91s,
   enquanto WUWU (183) e ARMARINHOS LIMA (513) ficaram mais de 35 minutos sem
   nunca terminar, reexecutando do zero a cada tentativa. Mesma causa que já
   tinha derrubado a sincronização de Pedidos, e mesmo remédio: a A31 usa as
   funções abaixo, uma fatia por step, e o que já concluiu fica memoizado.

   `importarCatalogoContaMercadoLivre`/`...Shopee` continuam exportadas e
   percorrendo tudo de uma vez. Hoje ninguém as chama — são o caminho para uso
   fora de um job (script, rota síncrona), onde não existe limite de step. Se
   voltarem a ser usadas de dentro do Inngest, o problema volta junto. */

/** Tamanho de fatia, no mesmo espírito do A5 (TAMANHO_DO_LOTE): grande o
 *  bastante para não explodir o número de steps, pequeno o bastante para uma
 *  fatia caber folgado no tempo limite. */
export const TAMANHO_FATIA_CATALOGO = 50;

export async function resolverContaParaImportar(
  ctx: CrudContext,
  channelAccountId: string,
  tipo: "mercadolivre" | "shopee",
): Promise<ContaParaImportar> {
  assertPerfil(ctx, ["admin", "gestor"]);
  const conta = await ctx.db
    .select({
      channelAccountId: channelAccount.id,
      brandId: channelAccount.brandId,
      brandSlug: brand.slug,
    })
    .from(channelAccount)
    .innerJoin(brand, and(eq(brand.id, channelAccount.brandId), eq(brand.orgId, channelAccount.orgId)))
    .where(and(
      eq(channelAccount.orgId, ctx.orgId),
      eq(channelAccount.id, channelAccountId),
      eq(channelAccount.tipo, tipo),
      eq(channelAccount.status, "conectado"),
    ))
    .then((rows) => rows[0]);

  if (!conta || !isBrandSlug(conta.brandSlug)) {
    throw new Error(`Conta ${tipo} não encontrada ou não conectada.`);
  }
  return { ...conta, brandSlug: conta.brandSlug };
}

/** Uma página do Mercado Livre. Devolve `fim` para o chamador parar sem
 *  precisar conhecer a paginação do ML. */
export async function importarPaginaCatalogoMercadoLivre(
  ctx: CrudContext,
  conta: ContaParaImportar,
  offset: number,
): Promise<{ produtosCriados: number; ignorados: number; total: number; proximoOffset: number; fim: boolean }> {
  const provider = await criarMLProvider(conta.brandSlug);
  const [pagina, vinculos] = await Promise.all([
    provider.listarAnunciosAtivos({ offset, limit: TAMANHO_FATIA_CATALOGO }),
    carregarVinculosDaConta(ctx, conta.channelAccountId),
  ]);
  let produtosCriados = 0;
  let ignorados = 0;
  const saldosPendentes: Array<typeof estoqueCanalSaldo.$inferInsert> = [];
  for (const item of pagina.items) {
    const resultado = await mapearItemCatalogo(ctx, conta, item, "importacao-mercadolivre", "ml", vinculos, saldosPendentes);
    if (resultado === "criado") produtosCriados += 1;
    else ignorados += 1;
  }
  await gravarSaldosPendentes(ctx, saldosPendentes);
  const proximoOffset = offset + pagina.limit;
  return {
    produtosCriados,
    ignorados,
    total: pagina.totalListings,
    proximoOffset,
    fim: pagina.items.length === 0 || proximoOffset >= pagina.totalListings,
  };
}

/** A Shopee entrega o catálogo inteiro de uma vez, então a divisão é feita
 *  sobre a lista já baixada — listar num step, gravar em fatias nos seguintes. */
export async function listarCatalogoShopeeParaImportar(conta: ContaParaImportar) {
  const provider = await criarShopeeProvider(conta.brandSlug);
  return provider.listarCatalogoAtivo();
}

export async function importarFatiaCatalogoShopee(
  ctx: CrudContext,
  conta: ContaParaImportar,
  itens: Awaited<ReturnType<typeof listarCatalogoShopeeParaImportar>>,
): Promise<{ produtosCriados: number; ignorados: number }> {
  assertPerfil(ctx, ["admin", "gestor"]);
  const vinculos = await carregarVinculosDaConta(ctx, conta.channelAccountId);
  let produtosCriados = 0;
  let ignorados = 0;
  const saldosPendentes: Array<typeof estoqueCanalSaldo.$inferInsert> = [];
  for (const item of itens) {
    const resultado = await mapearItemCatalogo(ctx, conta, item, "importacao-shopee", "shopee", vinculos, saldosPendentes);
    if (resultado === "criado") produtosCriados += 1;
    else ignorados += 1;
  }
  await gravarSaldosPendentes(ctx, saldosPendentes);
  return { produtosCriados, ignorados };
}

/** Formato mínimo que o gravador precisa, comum aos dois canais — ML e
 *  Shopee normalizam pra isto antes de chegar aqui (ver `MLAnuncioCatalogo`
 *  e `ShopeeAnuncioCatalogo`), cada um com sua própria lógica de busca. */
interface ItemCatalogoGenerico {
  listingId: string;
  variationId: string | null;
  externalSku: string | null;
  title: string;
  price: string;
  availableQuantity: number;
}

/** Grava (ou ignora, se já mapeado) um item de catálogo — produto +
 *  vínculo produto_canal + saldo inicial. Extraído de propósito pra ser
 *  neutro de canal: ML e Shopee chamam isto do próprio loop de paginação
 *  deles, que tem formato de página diferente entre os dois. `origem` só
 *  vira metadado no evento `produto.criado`, pra auditoria saber de onde
 *  veio cada produto criado automaticamente. */
/** Chave de um vínculo anúncio→produto dentro de uma conta de canal. */
function chaveVinculo(listingId: string, variationId: string | null): string {
  return `${listingId}|${variationId ?? ""}`;
}

/** Todos os vínculos que a conta já tem, numa consulta só.
 *
 *  `mapearItemCatalogo` perguntava ao banco item a item se aquele anúncio já
 *  estava vinculado. Numa marca já sincronizada isso é uma ida e volta por
 *  anúncio sem nenhuma escrita no fim — 50 consultas sequenciais por página,
 *  e a latência somada estourava os 60s de teto da função na Vercel
 *  (FUNCTION_INVOCATION_TIMEOUT em /api/inngest, 26/08/2026). Carregar o
 *  índice de uma vez troca 50 idas e voltas por uma. */
export async function carregarVinculosDaConta(
  ctx: CrudContext,
  channelAccountId: string,
): Promise<Map<string, { id: string; produtoId: string }>> {
  const linhas = await ctx.db
    .select({
      id: produtoCanal.id,
      produtoId: produtoCanal.produtoId,
      externalListingId: produtoCanal.externalListingId,
      externalWarehouseId: produtoCanal.externalWarehouseId,
    })
    .from(produtoCanal)
    .where(and(
      eq(produtoCanal.orgId, ctx.orgId),
      eq(produtoCanal.channelAccountId, channelAccountId),
    ));
  return new Map(linhas.map((l) => [
    chaveVinculo(l.externalListingId, l.externalWarehouseId),
    { id: l.id, produtoId: l.produtoId },
  ]));
}

async function mapearItemCatalogo(
  ctx: CrudContext,
  conta: ContaParaImportar,
  item: ItemCatalogoGenerico,
  origem: "importacao-mercadolivre" | "importacao-shopee",
  prefixoSkuGerado: string,
  /** Índice pré-carregado (ver carregarVinculosDaConta). Sem ele, cai na
   *  consulta por item — comportamento antigo, para quem chama fora de um job. */
  vinculosExistentes?: Map<string, { id: string; produtoId: string }>,
  saldosPendentes?: Array<typeof estoqueCanalSaldo.$inferInsert>,
): Promise<"criado" | "vinculado" | "ignorado"> {
  const chave = chaveVinculo(item.listingId, item.variationId);
  const jaMapeado = vinculosExistentes
    ? vinculosExistentes.get(chave)
    : await ctx.db
      .select({ id: produtoCanal.id, produtoId: produtoCanal.produtoId })
      .from(produtoCanal)
      .where(and(
        eq(produtoCanal.orgId, ctx.orgId),
        eq(produtoCanal.channelAccountId, conta.channelAccountId),
        eq(produtoCanal.externalListingId, item.listingId),
        item.variationId
          ? eq(produtoCanal.externalWarehouseId, item.variationId)
          : isNull(produtoCanal.externalWarehouseId),
      ))
      .then((rows) => rows[0]);
  if (jaMapeado) {
    // Uma sincronização de catálogo também traz o saldo atual. Antes um
    // anúncio já vinculado era descartado antes desta escrita, então o botão
    // contextual de Estoque não tinha como atualizar o dado que a pessoa
    // acabou de pedir. O índice pré-carregado mantém a leitura em lote; aqui
    // sobra somente a escrita necessária do saldo, idempotente por vínculo.
    const saldo: typeof estoqueCanalSaldo.$inferInsert = {
      orgId: ctx.orgId,
      produtoId: jaMapeado.produtoId,
      channelAccountId: conta.channelAccountId,
      produtoCanalId: jaMapeado.id,
      saldo: item.availableQuantity,
      verificadoEm: new Date(),
    };
    if (saldosPendentes) saldosPendentes.push(saldo);
    else await gravarSaldosPendentes(ctx, [saldo]);
    return "ignorado";
  }

  const sku = item.externalSku?.trim() || `${prefixoSkuGerado}-${item.listingId}${item.variationId ? `-${item.variationId}` : ""}`;

  try {
    const mapeado = await ctx.db.transaction(async (tx) => {
      const existente = await tx
        .select({ id: produto.id })
        .from(produto)
        .where(and(
          eq(produto.orgId, ctx.orgId),
          eq(produto.brandId, conta.brandId),
          eq(produto.sku, sku),
          isNull(produto.deletedAt),
        ))
        .then((rows) => rows[0]);

      const criado = existente ? null : await tx
        .insert(produto)
        .values({
          orgId: ctx.orgId,
          brandId: conta.brandId,
          sku,
          nome: item.title,
          preco: item.price,
          estoqueMinimo: 0,
          ativo: true,
        })
        .returning()
        .then((rows) => rows[0]);
      const produtoId = existente?.id ?? criado!.id;

      const vinculoDoProduto = await tx
        .select({ id: produtoCanal.id })
        .from(produtoCanal)
        .where(and(
          eq(produtoCanal.orgId, ctx.orgId),
          eq(produtoCanal.produtoId, produtoId),
          eq(produtoCanal.channelAccountId, conta.channelAccountId),
        ))
        .then((rows) => rows[0]);
      if (vinculoDoProduto) return false;

      const [vinculo] = await tx.insert(produtoCanal).values({
        orgId: ctx.orgId,
        produtoId,
        channelAccountId: conta.channelAccountId,
        externalListingId: item.listingId,
        externalSkuId: item.externalSku,
        externalWarehouseId: item.variationId,
        ativo: true,
      }).returning();
      vinculosExistentes?.set(chave, { id: vinculo.id, produtoId });

      // O anúncio já traz o saldo do canal — semeia aqui para o produto
      // não nascer zerado esperando a coleta noturna (A5).
      await tx.insert(estoqueCanalSaldo).values({
        orgId: ctx.orgId,
        produtoId,
        channelAccountId: conta.channelAccountId,
        produtoCanalId: vinculo.id,
        saldo: item.availableQuantity,
      });

      if (criado) {
        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          brandId: conta.brandId,
          autorId: ctx.userId,
          autorTipo: ctx.userId ? "usuario" : "sistema",
          entidade: "produto",
          entidadeId: criado.id,
          acao: "create",
          depois: criado,
        });

        const evento = await persistirEvento({
          tipo: "produto.criado",
          orgId: ctx.orgId,
          brandId: conta.brandId,
          entidade: "produto",
          entidadeId: criado.id,
          payload: { sku: criado.sku, nome: criado.nome, origem },
        }, tx);
        await despacharEvento(evento);
      }

      return true;
    });
    return mapeado ? "criado" : "ignorado";
  } catch (error) {
    // SKU duplicado (unique por org) é o caso esperado quando o
    // mesmo produto já existe sob outro anúncio/canal — segue o
    // catálogo em vez de abortar a importação inteira.
    console.error(`[estoque] falha ao importar anúncio ${item.listingId}`, error);
    return "ignorado";
  }
}

/** Um UPSERT por página/fatia, não um round-trip sequencial por anúncio. */
async function gravarSaldosPendentes(
  ctx: CrudContext,
  saldos: Array<typeof estoqueCanalSaldo.$inferInsert>,
) {
  if (saldos.length === 0) return;
  await ctx.db.insert(estoqueCanalSaldo).values(saldos).onConflictDoUpdate({
    target: estoqueCanalSaldo.produtoCanalId,
    set: {
      saldo: sql`excluded.saldo`,
      verificadoEm: new Date(),
    },
  });
}

/** O trabalho de verdade, isolado por conta — extraído pra poder rodar tanto
 *  em lote (todas as contas ML da org, ver importarCatalogoMercadoLivre)
 *  quanto disparado sozinho por uma única conta (Central de Sincronização). */
async function importarCatalogoDaConta(ctx: CrudContext, conta: ContaParaImportar): Promise<{ produtosCriados: number; ignorados: number }> {
  let produtosCriados = 0;
  let ignorados = 0;

  const provider = await criarMLProvider(conta.brandSlug);
  let offset = 0;
  let total = 1;
  while (offset < total) {
    // Sem `comAvaliacoes`: import de catálogo nunca leu nota/opinião do
    // retorno (só nome, preço e saldo), então não vale gastar a chamada
    // extra de /reviews/item por SKU — quem precisa disso é o módulo de
    // Avaliações, que já pede explicitamente (ver avaliacoes.service.ts).
    const pagina = await provider.listarAnunciosAtivos({ offset, limit: 50 });
    for (const item of pagina.items) {
      const resultado = await mapearItemCatalogo(ctx, conta, item, "importacao-mercadolivre", "ml");
      if (resultado === "criado") produtosCriados += 1;
      else ignorados += 1;
    }
    total = pagina.totalListings;
    offset += pagina.limit;
    if (pagina.items.length === 0) break;
  }

  return { produtosCriados, ignorados };
}

/** Mesma ideia do ML (ver `importarCatalogoDaConta`), implementação própria
 *  porque o formato de paginação/resposta da Shopee é outro — mas grava na
 *  MESMA tabela `produto`/`produtoCanal`, que já é multi-canal de origem,
 *  reaproveitando `mapearItemCatalogo`. `listarCatalogoAtivo` já devolve o
 *  catálogo inteiro de uma vez (pagina por dentro), então não tem loop de
 *  offset aqui como no ML. */
async function importarCatalogoDaContaShopee(ctx: CrudContext, conta: ContaParaImportar): Promise<{ produtosCriados: number; ignorados: number }> {
  let produtosCriados = 0;
  let ignorados = 0;

  const provider = await criarShopeeProvider(conta.brandSlug);
  const itens = await provider.listarCatalogoAtivo();
  for (const item of itens) {
    const resultado = await mapearItemCatalogo(ctx, conta, item, "importacao-shopee", "shopee");
    if (resultado === "criado") produtosCriados += 1;
    else ignorados += 1;
  }

  return { produtosCriados, ignorados };
}

/** Cadastro manual de produto, um a um, não dá conta de um catálogo com
 *  centenas de anúncios — por isso o módulo de Estoque fica vazio pra quem
 *  já vende no Mercado Livre. Essa importação lê os anúncios ativos de cada
 *  conta conectada e cria o produto + o vínculo produto_canal automático
 *  pra quem ainda não tem: o saldo inicial vem do "available_quantity" do
 *  próprio anúncio, e a partir daí a baixa automática (A2) assume. Anúncio
 *  já mapeado não é tocado — evita sobrescrever ajuste manual. */
export async function importarCatalogoMercadoLivre(ctx: CrudContext): Promise<{
  contasVerificadas: number;
  produtosCriados: number;
  ignorados: number;
}> {
  assertPerfil(ctx, ["admin", "gestor"]);

  const contas = await ctx.db
    .select({
      channelAccountId: channelAccount.id,
      brandId: channelAccount.brandId,
      brandSlug: brand.slug,
    })
    .from(channelAccount)
    .innerJoin(brand, and(eq(brand.id, channelAccount.brandId), eq(brand.orgId, channelAccount.orgId)))
    .where(and(
      eq(channelAccount.orgId, ctx.orgId),
      eq(channelAccount.tipo, "mercadolivre"),
      eq(channelAccount.status, "conectado"),
    ));

  let produtosCriados = 0;
  let ignorados = 0;

  for (const conta of contas) {
    if (!isBrandSlug(conta.brandSlug)) continue;
    try {
      const resultado = await importarCatalogoDaConta(ctx, { ...conta, brandSlug: conta.brandSlug });
      produtosCriados += resultado.produtosCriados;
      ignorados += resultado.ignorados;
    } catch (error) {
      console.error(`[estoque] importação de catálogo falhou para ${conta.brandSlug}`, error);
    }
  }

  return { contasVerificadas: contas.length, produtosCriados, ignorados };
}

/** Mesma importação, só que restrita a UMA conta — usada pela Central de
 *  Sincronização (Configurações), disparada por conta em vez de "todo mundo". */
export async function importarCatalogoContaMercadoLivre(ctx: CrudContext, channelAccountId: string): Promise<{
  produtosCriados: number;
  ignorados: number;
}> {
  assertPerfil(ctx, ["admin", "gestor"]);

  const conta = await ctx.db
    .select({
      channelAccountId: channelAccount.id,
      brandId: channelAccount.brandId,
      brandSlug: brand.slug,
    })
    .from(channelAccount)
    .innerJoin(brand, and(eq(brand.id, channelAccount.brandId), eq(brand.orgId, channelAccount.orgId)))
    .where(and(
      eq(channelAccount.orgId, ctx.orgId),
      eq(channelAccount.id, channelAccountId),
      eq(channelAccount.tipo, "mercadolivre"),
      eq(channelAccount.status, "conectado"),
    ))
    .then((rows) => rows[0]);

  if (!conta || !isBrandSlug(conta.brandSlug)) {
    throw new Error("Conta do Mercado Livre não encontrada ou não conectada.");
  }

  return importarCatalogoDaConta(ctx, { ...conta, brandSlug: conta.brandSlug });
}

/** Mesma função da Central de Sincronização (Configurações), só que pra
 *  Shopee — disparada por conta, junto de Avaliações no mesmo botão
 *  "Sincronizar" (ver A31-sincronizar-conta.ts). */
export async function importarCatalogoContaShopee(ctx: CrudContext, channelAccountId: string): Promise<{
  produtosCriados: number;
  ignorados: number;
}> {
  assertPerfil(ctx, ["admin", "gestor"]);

  const conta = await ctx.db
    .select({
      channelAccountId: channelAccount.id,
      brandId: channelAccount.brandId,
      brandSlug: brand.slug,
    })
    .from(channelAccount)
    .innerJoin(brand, and(eq(brand.id, channelAccount.brandId), eq(brand.orgId, channelAccount.orgId)))
    .where(and(
      eq(channelAccount.orgId, ctx.orgId),
      eq(channelAccount.id, channelAccountId),
      eq(channelAccount.tipo, "shopee"),
      eq(channelAccount.status, "conectado"),
    ))
    .then((rows) => rows[0]);

  if (!conta || !isBrandSlug(conta.brandSlug)) {
    throw new Error("Conta da Shopee não encontrada ou não conectada.");
  }

  return importarCatalogoDaContaShopee(ctx, { ...conta, brandSlug: conta.brandSlug });
}
