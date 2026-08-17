import { and, asc, count, desc, eq, getTableColumns, gte, ilike, inArray, isNull, notInArray, SQL, sql } from "drizzle-orm";
import { assertPerfil, type CrudContext } from "@/shared/lib/crud-factory";
import {
  auditLog, brand, channelAccount, produto, produtoCanal, estoqueCanalSaldo, pedido, pedidoItem,
} from "@/shared/lib/db/schema";
import { despacharEvento, persistirEvento } from "@/shared/events";
import { calcularScoreProduto } from "@/modules/scoring/domain/encalhe";
import { CANAIS_VENDA } from "@/shared/config/canais-venda";
import { CreateProdutoSchema, UpdateProdutoSchema } from "../domain/entities";
import {
  classificarEstoqueComRegua,
  minimoPelaRegua,
  type ReguaEstoque,
} from "../domain/regua-estoque";

export {
  FAIXAS_GIRO_PADRAO,
  minimoPelaRegua,
  type FaixaGiro,
  type ReguaEstoque,
} from "../domain/regua-estoque";

const DIAS_SEM_VENDA_ENCALHE = 30;
const LIMITE_RISCO_ENCALHE = 30;

export async function criarProduto(ctx: CrudContext, input: unknown) {
  const data = CreateProdutoSchema.parse(input);
  assertPerfil(ctx, ["admin", "gestor"]);

  const marcaValida = await ctx.db
    .select({ id: brand.id })
    .from(brand)
    .where(and(eq(brand.id, data.brandId), eq(brand.orgId, ctx.orgId), eq(brand.active, true)))
    .then((rows) => rows[0]);
  if (!marcaValida) throw new Error("Marca não pertence à organização.");

  const novo = await ctx.db.transaction(async (tx) => {
    const [created] = await tx.insert(produto).values({ ...data, orgId: ctx.orgId }).returning();
    await tx.insert(auditLog).values({
      orgId: ctx.orgId,
      brandId: created.brandId,
      autorId: ctx.userId,
      autorTipo: ctx.userId ? "usuario" : "sistema",
      entidade: "produto",
      entidadeId: created.id,
      acao: "create",
      depois: created,
    });
    await persistirEvento({
      tipo: "produto.criado",
      orgId: ctx.orgId,
      brandId: created.brandId,
      entidade: "produto",
      entidadeId: created.id,
      payload: { sku: created.sku, nome: created.nome },
    }, tx);
    return created;
  });

  return novo;
}

// Só nome/preço mudam o que é anunciado nos canais — estoqueMinimo é interno
// e não dispara sincronização de anúncio.
const CAMPOS_SINCRONIZAVEIS = ["nome", "preco"] as const;

export async function editarProduto(ctx: CrudContext, produtoId: string, input: unknown) {
  assertPerfil(ctx, ["admin", "gestor"]);
  const data = UpdateProdutoSchema.parse(input);

  const resultado = await ctx.db.transaction(async (tx) => {
    const antes = await tx
      .select()
      .from(produto)
      .where(and(eq(produto.orgId, ctx.orgId), eq(produto.id, produtoId), isNull(produto.deletedAt)))
      .then((rows) => rows[0]);
    if (!antes) throw new Error("Produto não encontrado.");

    const [depois] = await tx.update(produto).set({
      nome: data.nome,
      preco: data.preco,
      estoqueMinimo: data.estoqueMinimo,
      updatedAt: new Date(),
    }).where(eq(produto.id, produtoId)).returning();

    await tx.insert(auditLog).values({
      orgId: ctx.orgId,
      brandId: antes.brandId,
      autorId: ctx.userId,
      autorTipo: ctx.userId ? "usuario" : "sistema",
      entidade: "produto",
      entidadeId: produtoId,
      acao: "update",
      antes,
      depois,
    });

    const mudouAnuncio = CAMPOS_SINCRONIZAVEIS.some((campo) => antes[campo] !== depois[campo]);
    const eventoProduto = mudouAnuncio
      ? await persistirEvento({
          tipo: "produto.atualizado",
          orgId: ctx.orgId,
          brandId: antes.brandId,
          entidade: "produto",
          entidadeId: produtoId,
          payload: { produtoId, nome: depois.nome, preco: depois.preco },
        }, tx)
      : null;

    return { produto: depois, eventoProduto };
  });

  if (resultado.eventoProduto) await despacharEvento(resultado.eventoProduto);
  return resultado.produto;
}

/** Estados que a tela de Estoque usa como filtro e como contador de alerta.
 *  São mutuamente exclusivos de propósito: um SKU zerado aparece só em
 *  "sem_estoque", nunca também em "abaixo_minimo" — contadores que se
 *  sobrepõem somam mais que o total e destroem a confiança no número. */
export type EstadoEstoque = "abaixo_minimo" | "sem_estoque" | "sem_minimo";

/** Saldo do produto, derivado do que os canais informam.
 *
 *  É o MAIOR saldo entre os canais, não a soma: o mesmo lote físico é
 *  anunciado nos três, então somar contaria a mesma peça várias vezes.
 *
 *  Subquery correlacionada em vez de JOIN porque o saldo é 1:N por produto —
 *  um JOIN duplicaria a linha do produto por canal mapeado. Produto sem
 *  nenhum canal coletado cai em 0, que é o mesmo que a UI já tratava como
 *  "sem estoque".
 *
 *  Com filtro de canal ativo, o saldo passa a ser o daqueles canais apenas —
 *  a pergunta na tela deixa de ser "quanto tenho" e vira "quanto tenho ali". */
function saldoExpr(orgId: string, canalTipos?: readonly string[]): SQL<number> {
  const filtroCanal = canalTipos && canalTipos.length > 0
    ? sql`and conta_saldo."tipo" in ${canalTipos}`
    : sql``;
  return sql<number>`coalesce((
    select max(saldo_canal."saldo")
    from "estoque_canal_saldo" saldo_canal
    inner join "channel_account" conta_saldo
      on conta_saldo."id" = saldo_canal."channel_account_id"
    where saldo_canal."produto_id" = "produto"."id"
      and saldo_canal."org_id" = ${orgId}
      ${filtroCanal}
  ), 0)`;
}

/** Saldo de cada canal separadamente, para a tela mostrar lado a lado em vez
 *  de um número só. Vem como json para não multiplicar a linha do produto. */
function saldosPorCanalExpr(orgId: string): SQL<Array<{ canal: string; saldo: number; verificadoEm: string }>> {
  return sql`coalesce((
    select json_agg(json_build_object(
      'canal', conta_saldo."tipo",
      'saldo', saldo_canal."saldo",
      'verificadoEm', saldo_canal."verificado_em"
    ) order by conta_saldo."tipo")
    from "estoque_canal_saldo" saldo_canal
    inner join "channel_account" conta_saldo
      on conta_saldo."id" = saldo_canal."channel_account_id"
    where saldo_canal."produto_id" = "produto"."id"
      and saldo_canal."org_id" = ${orgId}
  ), '[]'::json)`;
}

/** Quantidade vendida por produto desde uma data.
 *
 *  Antes vinha do livro-razão (movimento de saída), que deixou de existir
 *  junto com o saldo local. A evidência de venda agora é o próprio pedido —
 *  fonte mais direta, aliás, porque o livro-razão era um reflexo dele.
 *  Cancelado e devolvido ficam de fora: não consumiram estoque. */
async function vendasPorProduto(
  ctx: CrudContext,
  produtoIds: string[],
  desde: Date,
): Promise<Map<string, number>> {
  if (produtoIds.length === 0) return new Map();
  const linhas = await ctx.db
    .select({
      produtoId: pedidoItem.produtoId,
      quantidade: sql<number>`sum(${pedidoItem.quantidade})`,
    })
    .from(pedidoItem)
    .innerJoin(pedido, eq(pedido.id, pedidoItem.pedidoId))
    .where(and(
      eq(pedido.orgId, ctx.orgId),
      notInArray(pedido.status, ["cancelado", "devolvido"]),
      gte(pedido.createdAt, desde),
      inArray(pedidoItem.produtoId, produtoIds),
    ))
    .groupBy(pedidoItem.produtoId);
  return new Map(linhas.map((linha) => [linha.produtoId, Number(linha.quantidade)]));
}

function condicaoEstado(estado: EstadoEstoque, saldo: SQL<number>): SQL {
  if (estado === "sem_estoque") return sql`${saldo} <= 0`;
  if (estado === "sem_minimo") return sql`${produto.estoqueMinimo} <= 0`;
  return sql`${saldo} > 0 and ${produto.estoqueMinimo} > 0 and ${saldo} <= ${produto.estoqueMinimo}`;
}

/** SKU tem no máximo um mapeamento ativo por tipo de canal (um produto pode
 *  estar em vários anúncios do mesmo canal, mas "está no Mercado Livre" é
 *  binário) — por isso EXISTS em vez de JOIN, que duplicaria a linha do
 *  produto por anúncio mapeado. Aceita um canal ou vários: com mais de um
 *  marcado, o produto entra se estiver em qualquer um deles (OR, via IN) —
 *  os canais se somam, não se cruzam entre si. */
function condicaoCanal(orgId: string, canalTipos: string | readonly string[]): SQL {
  const tipos = Array.isArray(canalTipos) ? canalTipos : [canalTipos as string];
  return sql`exists (
    select 1 from ${produtoCanal}
    inner join ${channelAccount} on ${channelAccount.id} = ${produtoCanal.channelAccountId}
    where ${produtoCanal.produtoId} = ${produto.id}
      and ${produtoCanal.orgId} = ${orgId}
      and ${produtoCanal.ativo} = true
      and ${inArray(channelAccount.tipo, tipos)}
  )`;
}

export async function listarProdutos(
  ctx: CrudContext,
  opts: {
    brandIds?: string[];
    busca?: string;
    estado?: EstadoEstoque;
    canalTipos?: string[];
    ids?: string[];
    limit?: number;
    offset?: number;
  } = {},
) {
  assertPerfil(ctx, ["admin", "gestor", "vendedor"]);
  const { limit = 50, offset = 0 } = opts;
  const filters: SQL[] = [eq(produto.orgId, ctx.orgId), isNull(produto.deletedAt)];
  if (opts.brandIds && opts.brandIds.length > 0) filters.push(inArray(produto.brandId, opts.brandIds));
  // "Capa cinza" deve achar "Capa Carro Forrada ... Cinza" mesmo sem as
  // palavras estarem juntas — cada termo digitado precisa aparecer em algum
  // lugar do SKU+nome, não necessariamente na mesma ordem ou adjacentes.
  if (opts.busca) {
    const termos = opts.busca.trim().split(/\s+/).filter(Boolean);
    for (const termo of termos) {
      filters.push(ilike(sql`${produto.sku} || ' ' || ${produto.nome}`, `%${termo}%`));
    }
  }
  const SALDO = saldoExpr(ctx.orgId, opts.canalTipos);
  if (opts.estado) filters.push(condicaoEstado(opts.estado, SALDO));
  if (opts.canalTipos && opts.canalTipos.length > 0) filters.push(condicaoCanal(ctx.orgId, opts.canalTipos));
  // Lista vazia significa "nenhum produto casa" (ex.: filtro de parados sem
  // resultado) — sem o guarda, inArray com [] geraria SQL inválido.
  if (opts.ids) filters.push(opts.ids.length > 0 ? inArray(produto.id, opts.ids) : sql`false`);

  const [rows, totalRows] = await Promise.all([
    ctx.db
      .select({
        id: produto.id,
        orgId: produto.orgId,
        brandId: produto.brandId,
        brandName: brand.name,
        brandSlug: brand.slug,
        sku: produto.sku,
        nome: produto.nome,
        preco: produto.preco,
        estoqueMinimo: produto.estoqueMinimo,
        ativo: produto.ativo,
        createdAt: produto.createdAt,
        updatedAt: produto.updatedAt,
        saldo: SALDO,
        saldosCanais: saldosPorCanalExpr(ctx.orgId),
        // Canais em que o produto está anunciado agora — subquery correlacionada
        // em vez de JOIN porque um produto pode ter vários mapeamentos ativos
        // (inclusive mais de um no mesmo canal) e um JOIN duplicaria a linha.
        canais: sql<string[]>`coalesce((
          select array_agg(distinct ${channelAccount.tipo})
          from ${produtoCanal}
          inner join ${channelAccount} on ${channelAccount.id} = ${produtoCanal.channelAccountId}
          where ${produtoCanal.produtoId} = ${produto.id} and ${produtoCanal.ativo} = true
        ), '{}')`,
      })
      .from(produto)
      .innerJoin(brand, and(
        eq(brand.id, produto.brandId),
        eq(brand.orgId, ctx.orgId),
      ))
      .where(and(...filters))
      .orderBy(produto.nome)
      .limit(limit)
      .offset(offset),
    ctx.db
      .select({ total: count() })
      .from(produto)
      .where(and(...filters)),
  ]);

  return { data: rows, total: totalRows[0]?.total ?? 0, limit, offset };
}

/** Alimenta a faixa de alertas do topo da tela. Uma varredura só, agregando
 *  os três estados de saldo de uma vez — três COUNT separados fariam o
 *  mesmo scan três vezes. */
export async function contarIndicadoresEstoque(
  ctx: CrudContext,
  opts: { brandIds?: string[]; canalTipos?: string[] } = {},
) {
  assertPerfil(ctx, ["admin", "gestor", "vendedor"]);
  const filters: SQL[] = [eq(produto.orgId, ctx.orgId), isNull(produto.deletedAt)];
  if (opts.brandIds && opts.brandIds.length > 0) filters.push(inArray(produto.brandId, opts.brandIds));
  if (opts.canalTipos && opts.canalTipos.length > 0) filters.push(condicaoCanal(ctx.orgId, opts.canalTipos));

  const SALDO = saldoExpr(ctx.orgId, opts.canalTipos);
  const [linha] = await ctx.db
    .select({
      total: count(),
      abaixoMinimo: sql<number>`count(*) filter (where ${condicaoEstado("abaixo_minimo", SALDO)})`,
      semEstoque: sql<number>`count(*) filter (where ${condicaoEstado("sem_estoque", SALDO)})`,
      semMinimo: sql<number>`count(*) filter (where ${condicaoEstado("sem_minimo", SALDO)})`,
    })
    .from(produto)
    .where(and(...filters));

  return {
    total: Number(linha?.total ?? 0),
    abaixoMinimo: Number(linha?.abaixoMinimo ?? 0),
    semEstoque: Number(linha?.semEstoque ?? 0),
    semMinimo: Number(linha?.semMinimo ?? 0),
  };
}

/** Alimenta o seletor de canal no topo da tela. Cada entrada diz se a conta
 *  está de fato conectada (não apenas cadastrada) e quantos SKUs têm anúncio
 *  mapeado nela — sem isso o seletor não sabe o que desabilitar nem o que
 *  mostrar como contagem na pílula. */
export async function contarProdutosPorCanal(ctx: CrudContext, opts: { brandIds?: string[] } = {}) {
  assertPerfil(ctx, ["admin", "gestor", "vendedor"]);

  const contas = await ctx.db
    .select({ tipo: channelAccount.tipo, status: channelAccount.status })
    .from(channelAccount)
    .where(eq(channelAccount.orgId, ctx.orgId));

  const conectadoPorTipo = new Map<string, boolean>();
  for (const conta of contas) {
    if (conta.status === "conectado") conectadoPorTipo.set(conta.tipo, true);
    else if (!conectadoPorTipo.has(conta.tipo)) conectadoPorTipo.set(conta.tipo, false);
  }

  const contagens = await ctx.db
    .select({ tipo: channelAccount.tipo, total: sql<number>`count(distinct ${produtoCanal.produtoId})` })
    .from(produtoCanal)
    .innerJoin(channelAccount, eq(channelAccount.id, produtoCanal.channelAccountId))
    .innerJoin(produto, and(
      eq(produto.id, produtoCanal.produtoId),
      isNull(produto.deletedAt),
      // Espelha o cruzamento de contarProdutosPorMarca: com empresas ativas, a
      // pílula do canal conta os SKUs daquelas empresas (OR entre elas), não
      // do catálogo inteiro.
      ...(opts.brandIds && opts.brandIds.length > 0 ? [inArray(produto.brandId, opts.brandIds)] : []),
    ))
    .where(and(eq(produtoCanal.orgId, ctx.orgId), eq(produtoCanal.ativo, true)))
    .groupBy(channelAccount.tipo);
  const totalPorTipo = new Map(contagens.map((linha) => [linha.tipo, Number(linha.total)]));

  return CANAIS_VENDA.map((tipo) => ({
    tipo,
    conectado: conectadoPorTipo.get(tipo) ?? false,
    total: totalPorTipo.get(tipo) ?? 0,
  }));
}

/** Alimenta o seletor de marca no topo da tela, ao lado do de canal. Recebe o
 *  canal ativo porque as duas dimensões se cruzam: com o Mercado Livre
 *  selecionado, a contagem de cada marca tem que ser a de SKUs anunciados
 *  naquele canal — não a do catálogo inteiro. Marca que zera no canal ativo
 *  aparece esmaecida, do mesmo jeito que canal sem conta conectada. */
export async function contarProdutosPorMarca(
  ctx: CrudContext,
  opts: { canalTipos?: string[] } = {},
) {
  assertPerfil(ctx, ["admin", "gestor", "vendedor"]);

  const filters: SQL[] = [eq(produto.orgId, ctx.orgId), isNull(produto.deletedAt)];
  if (opts.canalTipos && opts.canalTipos.length > 0) filters.push(condicaoCanal(ctx.orgId, opts.canalTipos));

  // LEFT JOIN a partir da marca: marca sem nenhum produto no canal ativo
  // precisa continuar na lista, com zero — some-la mudaria o conjunto de
  // pílulas a cada clique e a barra de filtros "dançaria".
  return ctx.db
    .select({
      brandId: brand.id,
      name: brand.name,
      slug: brand.slug,
      total: sql<number>`count(${produto.id})`,
    })
    .from(brand)
    .leftJoin(produto, and(eq(produto.brandId, brand.id), ...filters))
    .where(and(eq(brand.orgId, ctx.orgId), eq(brand.active, true)))
    .groupBy(brand.id, brand.name, brand.slug)
    .orderBy(desc(sql`count(${produto.id})`), asc(brand.name))
    .then((linhas) => linhas.map((linha) => ({ ...linha, total: Number(linha.total) })));
}

/** Define o mesmo estoque mínimo para vários SKUs de uma vez. Sem isso, um
 *  catálogo importado (centenas de produtos com mínimo 0) nunca chega a ter
 *  alerta útil — o A6 só dispararia com saldo zerado. */
export async function definirEstoqueMinimoEmLote(
  ctx: CrudContext,
  produtoIds: string[],
  estoqueMinimo: number,
): Promise<{ atualizados: number }> {
  assertPerfil(ctx, ["admin", "gestor"]);
  if (produtoIds.length === 0) return { atualizados: 0 };
  if (!Number.isInteger(estoqueMinimo) || estoqueMinimo < 0) {
    throw new Error("Estoque mínimo deve ser um número inteiro igual ou maior que zero.");
  }

  const atualizados = await ctx.db.transaction(async (tx) => {
    const alvos = await tx
      .select({ id: produto.id, brandId: produto.brandId, estoqueMinimo: produto.estoqueMinimo })
      .from(produto)
      .where(and(
        eq(produto.orgId, ctx.orgId),
        isNull(produto.deletedAt),
        inArray(produto.id, produtoIds),
      ));
    if (alvos.length === 0) return [];

    await tx
      .update(produto)
      .set({ estoqueMinimo, updatedAt: new Date() })
      .where(and(eq(produto.orgId, ctx.orgId), inArray(produto.id, alvos.map((item) => item.id))));

    await tx.insert(auditLog).values(alvos.map((alvo) => ({
      orgId: ctx.orgId,
      brandId: alvo.brandId,
      autorId: ctx.userId,
      autorTipo: ctx.userId ? ("usuario" as const) : ("sistema" as const),
      entidade: "produto",
      entidadeId: alvo.id,
      acao: "update",
      antes: { estoqueMinimo: alvo.estoqueMinimo },
      depois: { estoqueMinimo },
    })));

    return alvos;
  });

  return { atualizados: atualizados.length };
}

/* ── Régua de estoque mínimo ────────────────────────────────────────────────
   Um catálogo importado nasce inteiro com estoqueMinimo = 0, e mínimo 0 é o
   mesmo que alerta desligado: o A6 nunca dispara e "abaixo do mínimo" fica
   permanentemente em zero. Definir isso SKU por SKU é inviável em centenas de
   itens, então a régua transforma a configuração numa decisão só — fixa, ou
   proporcional ao giro de cada produto. */

/** Faixa de giro → estoque mínimo. `vendaMensalMinima` é o piso da faixa; o
 *  primeiro piso que o giro do SKU alcança define o mínimo dele. */
export type EscopoRegua = {
  brandId?: string;
  canalTipo?: string;
  /** Só toca em quem ainda não tem régua — o padrão do wizard, para não
   *  sobrescrever mínimos que alguém já ajustou à mão. */
  somenteSemMinimo?: boolean;
};

const DIAS_JANELA_GIRO = 90;
const MESES_JANELA_GIRO = DIAS_JANELA_GIRO / 30;
/** A prévia do wizard lista SKUs para revisão humana; acima disso a lista deixa
 *  de ser revisável e só engorda o payload. Os contadores continuam vindo do
 *  escopo inteiro. */
const LIMITE_PREVIA_REGUA = 200;

function filtrosEscopo(ctx: CrudContext, escopo: EscopoRegua): SQL[] {
  const filters: SQL[] = [eq(produto.orgId, ctx.orgId), isNull(produto.deletedAt)];
  if (escopo.brandId) filters.push(eq(produto.brandId, escopo.brandId));
  if (escopo.canalTipo) filters.push(condicaoCanal(ctx.orgId, escopo.canalTipo));
  if (escopo.somenteSemMinimo) filters.push(condicaoEstado("sem_minimo", saldoExpr(ctx.orgId, escopo.canalTipo ? [escopo.canalTipo] : undefined)));
  return filters;
}

/** Calcula o mínimo que cada SKU do escopo receberia, sem gravar nada. É o que
 *  permite ao wizard mostrar a consequência ("34 SKUs entrariam em alerta hoje")
 *  antes de a pessoa confirmar. */
export async function simularReguaEstoque(
  ctx: CrudContext,
  escopo: EscopoRegua,
  regua: ReguaEstoque,
) {
  assertPerfil(ctx, ["admin", "gestor"]);

  const alvos = await ctx.db
    .select({
      id: produto.id,
      sku: produto.sku,
      nome: produto.nome,
      brandName: brand.name,
      brandSlug: brand.slug,
      estoqueMinimo: produto.estoqueMinimo,
      saldo: saldoExpr(ctx.orgId, escopo.canalTipo ? [escopo.canalTipo] : undefined),
    })
    .from(produto)
    .innerJoin(brand, and(eq(brand.id, produto.brandId), eq(brand.orgId, ctx.orgId)))
    .where(and(...filtrosEscopo(ctx, escopo)))
    .orderBy(produto.nome);

  const vazio = {
    resumo: { total: 0, monitorados: 0, semAlerta: 0, alertariam: 0, semEstoque: 0, alterados: 0 },
    previaAlerta: [] as Array<{
      id: string; sku: string; nome: string; brandName: string; brandSlug: string;
      saldo: number; minimoAtual: number; minimoProposto: number; giroMensal: number;
    }>,
    previaTruncada: false,
  };
  if (alvos.length === 0) return vazio;

  // Giro real do período: uma agregação só para todo o escopo, lida dos
  // pedidos do intervalo.
  const corte = new Date(Date.now() - DIAS_JANELA_GIRO * 86_400_000);
  const saidaPorProduto = await vendasPorProduto(ctx, alvos.map((item) => item.id), corte);

  const resumo = { total: alvos.length, monitorados: 0, semAlerta: 0, alertariam: 0, semEstoque: 0, alterados: 0 };
  const previaAlerta: typeof vazio.previaAlerta = [];

  for (const alvo of alvos) {
    const saldo = Number(alvo.saldo ?? 0);
    const giroMensal = (saidaPorProduto.get(alvo.id) ?? 0) / MESES_JANELA_GIRO;
    const minimoProposto = minimoPelaRegua(regua, giroMensal);

    if (minimoProposto > 0) resumo.monitorados += 1;
    else resumo.semAlerta += 1;
    if (minimoProposto !== alvo.estoqueMinimo) resumo.alterados += 1;

    const estado = classificarEstoqueComRegua(saldo, minimoProposto);
    if (estado === "sem_estoque") resumo.semEstoque += 1;
    if (estado === "abaixo_minimo") {
      resumo.alertariam += 1;
      if (previaAlerta.length < LIMITE_PREVIA_REGUA) {
        previaAlerta.push({
          id: alvo.id,
          sku: alvo.sku,
          nome: alvo.nome,
          brandName: alvo.brandName,
          brandSlug: alvo.brandSlug,
          saldo,
          minimoAtual: alvo.estoqueMinimo,
          minimoProposto,
          giroMensal: Math.round(giroMensal * 10) / 10,
        });
      }
    }
  }

  return { resumo, previaAlerta, previaTruncada: resumo.alertariam > previaAlerta.length };
}

/** Aplica a régua. Recalcula o mínimo no servidor em vez de aceitar os valores
 *  que o cliente já viu na prévia: a prévia é informativa, a decisão de quanto
 *  gravar é sempre daqui. */
export async function aplicarReguaEstoque(
  ctx: CrudContext,
  escopo: EscopoRegua,
  regua: ReguaEstoque,
  excluirIds: string[] = [],
): Promise<{ atualizados: number; inalterados: number }> {
  assertPerfil(ctx, ["admin", "gestor"]);

  const alvos = await ctx.db
    .select({
      id: produto.id,
      brandId: produto.brandId,
      estoqueMinimo: produto.estoqueMinimo,
    })
    .from(produto)
    .where(and(...filtrosEscopo(ctx, escopo)));

  const excluidos = new Set(excluirIds);
  const candidatos = alvos.filter((alvo) => !excluidos.has(alvo.id));
  if (candidatos.length === 0) return { atualizados: 0, inalterados: 0 };

  const corte = new Date(Date.now() - DIAS_JANELA_GIRO * 86_400_000);
  const saidaPorProduto = await vendasPorProduto(ctx, candidatos.map((item) => item.id), corte);

  // Agrupa por valor: com faixas de giro há no máximo um UPDATE por faixa,
  // em vez de um por SKU.
  const porMinimo = new Map<number, typeof candidatos>();
  let inalterados = 0;
  for (const alvo of candidatos) {
    const giroMensal = (saidaPorProduto.get(alvo.id) ?? 0) / MESES_JANELA_GIRO;
    const minimoProposto = minimoPelaRegua(regua, giroMensal);
    if (minimoProposto === alvo.estoqueMinimo) { inalterados += 1; continue; }
    const grupo = porMinimo.get(minimoProposto);
    if (grupo) grupo.push(alvo);
    else porMinimo.set(minimoProposto, [alvo]);
  }
  if (porMinimo.size === 0) return { atualizados: 0, inalterados };

  const LOTE_AUDITORIA = 500;
  const atualizados = await ctx.db.transaction(async (tx) => {
    let total = 0;
    for (const [minimo, grupo] of porMinimo) {
      const ids = grupo.map((item) => item.id);
      await tx
        .update(produto)
        .set({ estoqueMinimo: minimo, updatedAt: new Date() })
        .where(and(eq(produto.orgId, ctx.orgId), inArray(produto.id, ids)));

      const linhas = grupo.map((alvo) => ({
        orgId: ctx.orgId,
        brandId: alvo.brandId,
        autorId: ctx.userId,
        autorTipo: ctx.userId ? ("usuario" as const) : ("sistema" as const),
        entidade: "produto",
        entidadeId: alvo.id,
        acao: "update",
        antes: { estoqueMinimo: alvo.estoqueMinimo },
        depois: { estoqueMinimo: minimo, origem: regua.tipo === "giro" ? "regua_giro" : "regua_fixa" },
      }));
      for (let i = 0; i < linhas.length; i += LOTE_AUDITORIA) {
        await tx.insert(auditLog).values(linhas.slice(i, i + LOTE_AUDITORIA));
      }
      total += ids.length;
    }
    return total;
  });

  return { atualizados, inalterados };
}

// Mesma fórmula de risco do job A7-encalhe (src/modules/jobs/A7-encalhe.ts),
// mas calculada em lote e sob demanda para alimentar o indicador da tela de
// Estoque — o job noturno só emite o evento, não persiste um status.
export async function listarProdutosParados(ctx: CrudContext) {
  assertPerfil(ctx, ["admin", "gestor", "vendedor"]);

  const SALDO = saldoExpr(ctx.orgId);
  const candidatos = await ctx.db
    .select({
      id: produto.id, sku: produto.sku, nome: produto.nome, preco: produto.preco,
      saldo: SALDO, criadoEm: produto.createdAt,
    })
    .from(produto)
    .where(and(
      eq(produto.orgId, ctx.orgId),
      eq(produto.ativo, true),
      isNull(produto.deletedAt),
      sql`${SALDO} > 0`,
    ));

  if (candidatos.length === 0) return [];

  const ultimasVendas = await ctx.db
    .select({ produtoId: pedidoItem.produtoId, ultimaVenda: sql<string>`max(${pedido.createdAt})` })
    .from(pedidoItem)
    .innerJoin(pedido, eq(pedido.id, pedidoItem.pedidoId))
    .where(and(
      eq(pedido.orgId, ctx.orgId),
      notInArray(pedido.status, ["cancelado", "devolvido"]),
      inArray(pedidoItem.produtoId, candidatos.map((item) => item.id)),
    ))
    .groupBy(pedidoItem.produtoId);

  const ultimaVendaPorProduto = new Map(ultimasVendas.map((item) => [item.produtoId, item.ultimaVenda]));

  return candidatos
    .map((item) => {
      // Sem venda registrada, a régua é a data de cadastro — produto que
      // entrou ontem não está encalhado, só é novo. Fixar um valor acima do
      // limite fazia um catálogo recém-importado nascer inteiro como parado.
      const ultimaVenda = ultimaVendaPorProduto.get(item.id);
      const referencia = ultimaVenda ?? item.criadoEm;
      const diasSemVenda = Math.floor((Date.now() - new Date(referencia).getTime()) / 86_400_000);
      if (diasSemVenda < DIAS_SEM_VENDA_ENCALHE) return null;

      const score = calcularScoreProduto({
        diasSemVenda, giroMensalMedio: 0, saldoAtual: item.saldo, precoUnitario: parseFloat(item.preco ?? "0"),
      });
      if (score.riscoEncalhe < LIMITE_RISCO_ENCALHE) return null;

      return {
        id: item.id, sku: item.sku, nome: item.nome, saldo: item.saldo,
        diasSemVenda, riscoEncalhe: score.riscoEncalhe, capitalParado: score.capitalParado,
        acaoSugerida: score.acaoSugerida,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => b.riscoEncalhe - a.riscoEncalhe);
}

/** Alimenta a página cheia de produto (/estoque/produtos/[id]), no mesmo
 *  espírito do Cliente 360: uma tela própria em vez de um modal, com edição
 *  entrando por um lápis dentro dela — não um botão de editar disputando
 *  espaço na linha da tabela. */
export async function buscarProdutoDetalhe(ctx: CrudContext, produtoId: string) {
  const produtoRow = await ctx.db
    .select({ ...getTableColumns(produto), brandSlug: brand.slug, brandName: brand.name })
    .from(produto)
    .innerJoin(brand, eq(brand.id, produto.brandId))
    .where(and(eq(produto.id, produtoId), eq(produto.orgId, ctx.orgId), isNull(produto.deletedAt)))
    .then((rows) => rows[0]);
  if (!produtoRow) throw new Error("Produto não encontrado.");

  // O saldo por canal substitui tanto o saldo local quanto o extrato de
  // movimentos: cada linha diz quanto aquele canal informa e quando foi lido.
  const canaisVinculados = await ctx.db
    .select({
      id: produtoCanal.id,
      externalListingId: produtoCanal.externalListingId,
      externalSkuId: produtoCanal.externalSkuId,
      ativo: produtoCanal.ativo,
      canalTipo: channelAccount.tipo,
      saldo: estoqueCanalSaldo.saldo,
      verificadoEm: estoqueCanalSaldo.verificadoEm,
    })
    .from(produtoCanal)
    .innerJoin(channelAccount, eq(channelAccount.id, produtoCanal.channelAccountId))
    .leftJoin(estoqueCanalSaldo, eq(estoqueCanalSaldo.produtoCanalId, produtoCanal.id))
    .where(and(eq(produtoCanal.orgId, ctx.orgId), eq(produtoCanal.produtoId, produtoId)));

  // Mesmo lote anunciado em vários canais: o saldo do produto é o maior deles.
  const saldo = canaisVinculados.reduce((maior, item) => Math.max(maior, item.saldo ?? 0), 0);

  return { produto: produtoRow, saldo, canais: canaisVinculados };
}
