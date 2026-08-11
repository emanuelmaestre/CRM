import { and, asc, count, desc, eq, getTableColumns, gt, gte, ilike, inArray, isNull, SQL, sql } from "drizzle-orm";
import { assertPerfil, type CrudContext } from "@/shared/lib/crud-factory";
import {
  auditLog, brand, channelAccount, produto, produtoCanal, estoqueDivergencia, estoqueSaldo, estoqueMovimento,
} from "@/shared/lib/db/schema";
import { despacharEvento, despacharEventosPendentes, persistirEvento } from "@/shared/events";
import { calcularScoreProduto } from "@/modules/scoring/domain/encalhe";
import { CANAIS_VENDA } from "@/shared/config/canais-venda";
import {
  validarMovimento, calcularNovoSaldo, type MovimentoTipo, CreateProdutoSchema, UpdateProdutoSchema,
} from "../domain/entities";

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
    await tx.insert(estoqueSaldo).values({ orgId: ctx.orgId, produtoId: created.id, saldo: 0 });
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

const SALDO = sql<number>`coalesce(${estoqueSaldo.saldo}, 0)`;

function condicaoEstado(estado: EstadoEstoque): SQL {
  if (estado === "sem_estoque") return sql`${SALDO} <= 0`;
  if (estado === "sem_minimo") return sql`${produto.estoqueMinimo} <= 0`;
  return sql`${SALDO} > 0 and ${produto.estoqueMinimo} > 0 and ${SALDO} <= ${produto.estoqueMinimo}`;
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
  if (opts.estado) filters.push(condicaoEstado(opts.estado));
  if (opts.canalTipos && opts.canalTipos.length > 0) filters.push(condicaoCanal(ctx.orgId, opts.canalTipos));
  // Lista vazia significa "nenhum produto casa" (ex.: filtro de parados sem
  // resultado) — sem o guarda, inArray com [] geraria SQL inválido.
  if (opts.ids) filters.push(opts.ids.length > 0 ? inArray(produto.id, opts.ids) : sql`false`);

  // A contagem repete o join de saldo porque os filtros de estado leem a
  // coluna de saldo — sem o join aqui, o total divergiria da lista.
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
      .leftJoin(estoqueSaldo, and(
        eq(estoqueSaldo.produtoId, produto.id),
        eq(estoqueSaldo.orgId, ctx.orgId),
      ))
      .where(and(...filters))
      .orderBy(produto.nome)
      .limit(limit)
      .offset(offset),
    ctx.db
      .select({ total: count() })
      .from(produto)
      .leftJoin(estoqueSaldo, and(
        eq(estoqueSaldo.produtoId, produto.id),
        eq(estoqueSaldo.orgId, ctx.orgId),
      ))
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

  const [linha] = await ctx.db
    .select({
      total: count(),
      abaixoMinimo: sql<number>`count(*) filter (where ${condicaoEstado("abaixo_minimo")})`,
      semEstoque: sql<number>`count(*) filter (where ${condicaoEstado("sem_estoque")})`,
      semMinimo: sql<number>`count(*) filter (where ${condicaoEstado("sem_minimo")})`,
    })
    .from(produto)
    .leftJoin(estoqueSaldo, and(
      eq(estoqueSaldo.produtoId, produto.id),
      eq(estoqueSaldo.orgId, ctx.orgId),
    ))
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
export type FaixaGiro = { vendaMensalMinima: number; minimo: number };

export type ReguaEstoque =
  | { tipo: "fixo"; minimo: number }
  | { tipo: "giro"; faixas: FaixaGiro[] };

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

export const FAIXAS_GIRO_PADRAO: FaixaGiro[] = [
  { vendaMensalMinima: 10, minimo: 12 },
  { vendaMensalMinima: 3, minimo: 4 },
  { vendaMensalMinima: 1, minimo: 2 },
  { vendaMensalMinima: 0, minimo: 0 },
];

export function minimoPelaRegua(regua: ReguaEstoque, giroMensal: number): number {
  if (regua.tipo === "fixo") return regua.minimo;
  // As faixas podem chegar em qualquer ordem; a decisão precisa ser
  // determinística, então ordenamos aqui em vez de confiar no payload.
  const faixas = [...regua.faixas].sort((a, b) => b.vendaMensalMinima - a.vendaMensalMinima);
  for (const faixa of faixas) {
    if (giroMensal >= faixa.vendaMensalMinima) return faixa.minimo;
  }
  return 0;
}

/** Mesma exclusividade de `condicaoEstado`: um SKU zerado é "sem estoque", nunca
 *  também "abaixo do mínimo" — se a prévia divergisse disso, os números do
 *  wizard não bateriam com os da tela depois de aplicar. */
function estadoComRegua(saldo: number, minimo: number) {
  if (saldo <= 0) return "sem_estoque" as const;
  if (minimo > 0 && saldo <= minimo) return "abaixo_minimo" as const;
  if (minimo <= 0) return "sem_alerta" as const;
  return "ok" as const;
}

function filtrosEscopo(ctx: CrudContext, escopo: EscopoRegua): SQL[] {
  const filters: SQL[] = [eq(produto.orgId, ctx.orgId), isNull(produto.deletedAt)];
  if (escopo.brandId) filters.push(eq(produto.brandId, escopo.brandId));
  if (escopo.canalTipo) filters.push(condicaoCanal(ctx.orgId, escopo.canalTipo));
  if (escopo.somenteSemMinimo) filters.push(condicaoEstado("sem_minimo"));
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
      saldo: SALDO,
    })
    .from(produto)
    .innerJoin(brand, and(eq(brand.id, produto.brandId), eq(brand.orgId, ctx.orgId)))
    .leftJoin(estoqueSaldo, and(
      eq(estoqueSaldo.produtoId, produto.id),
      eq(estoqueSaldo.orgId, ctx.orgId),
    ))
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

  // Giro real do período: uma agregação só para todo o escopo. Movimento de
  // saída é a única evidência de venda no livro-razão.
  const corte = new Date(Date.now() - DIAS_JANELA_GIRO * 86_400_000);
  const saidas = await ctx.db
    .select({
      produtoId: estoqueMovimento.produtoId,
      quantidade: sql<number>`sum(${estoqueMovimento.quantidade})`,
    })
    .from(estoqueMovimento)
    .where(and(
      eq(estoqueMovimento.orgId, ctx.orgId),
      eq(estoqueMovimento.tipo, "saida"),
      gte(estoqueMovimento.createdAt, corte),
      inArray(estoqueMovimento.produtoId, alvos.map((item) => item.id)),
    ))
    .groupBy(estoqueMovimento.produtoId);
  const saidaPorProduto = new Map(saidas.map((linha) => [linha.produtoId, Number(linha.quantidade)]));

  const resumo = { total: alvos.length, monitorados: 0, semAlerta: 0, alertariam: 0, semEstoque: 0, alterados: 0 };
  const previaAlerta: typeof vazio.previaAlerta = [];

  for (const alvo of alvos) {
    const saldo = Number(alvo.saldo ?? 0);
    const giroMensal = (saidaPorProduto.get(alvo.id) ?? 0) / MESES_JANELA_GIRO;
    const minimoProposto = minimoPelaRegua(regua, giroMensal);

    if (minimoProposto > 0) resumo.monitorados += 1;
    else resumo.semAlerta += 1;
    if (minimoProposto !== alvo.estoqueMinimo) resumo.alterados += 1;

    const estado = estadoComRegua(saldo, minimoProposto);
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
    .leftJoin(estoqueSaldo, and(
      eq(estoqueSaldo.produtoId, produto.id),
      eq(estoqueSaldo.orgId, ctx.orgId),
    ))
    .where(and(...filtrosEscopo(ctx, escopo)));

  const excluidos = new Set(excluirIds);
  const candidatos = alvos.filter((alvo) => !excluidos.has(alvo.id));
  if (candidatos.length === 0) return { atualizados: 0, inalterados: 0 };

  const corte = new Date(Date.now() - DIAS_JANELA_GIRO * 86_400_000);
  const saidas = await ctx.db
    .select({
      produtoId: estoqueMovimento.produtoId,
      quantidade: sql<number>`sum(${estoqueMovimento.quantidade})`,
    })
    .from(estoqueMovimento)
    .where(and(
      eq(estoqueMovimento.orgId, ctx.orgId),
      eq(estoqueMovimento.tipo, "saida"),
      gte(estoqueMovimento.createdAt, corte),
      inArray(estoqueMovimento.produtoId, candidatos.map((item) => item.id)),
    ))
    .groupBy(estoqueMovimento.produtoId);
  const saidaPorProduto = new Map(saidas.map((linha) => [linha.produtoId, Number(linha.quantidade)]));

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

  const candidatos = await ctx.db
    .select({
      id: produto.id, sku: produto.sku, nome: produto.nome, preco: produto.preco,
      saldo: estoqueSaldo.saldo, criadoEm: produto.createdAt,
    })
    .from(produto)
    .innerJoin(estoqueSaldo, eq(estoqueSaldo.produtoId, produto.id))
    .where(and(eq(produto.orgId, ctx.orgId), eq(produto.ativo, true), isNull(produto.deletedAt), gt(estoqueSaldo.saldo, 0)));

  if (candidatos.length === 0) return [];

  const ultimasVendas = await ctx.db
    .select({ produtoId: estoqueMovimento.produtoId, ultimaVenda: sql<string>`max(${estoqueMovimento.createdAt})` })
    .from(estoqueMovimento)
    .where(and(
      eq(estoqueMovimento.orgId, ctx.orgId),
      eq(estoqueMovimento.tipo, "saida"),
      inArray(estoqueMovimento.produtoId, candidatos.map((item) => item.id)),
    ))
    .groupBy(estoqueMovimento.produtoId);

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

export async function registrarMovimento(
  ctx: CrudContext,
  input: {
    produtoId: string;
    tipo: MovimentoTipo;
    quantidade: number;
    referenciaId?: string;
    referenciaTipo?: string;
    observacao?: string;
  }
) {
  assertPerfil(ctx, ["admin", "gestor"]);

  const resultado = await ctx.db.transaction(async (tx) => {
    const produtoRow = await tx
      .select({ id: produto.id, brandId: produto.brandId, estoqueMinimo: produto.estoqueMinimo })
      .from(produto)
      .where(and(eq(produto.orgId, ctx.orgId), eq(produto.id, input.produtoId), isNull(produto.deletedAt)))
      .then((rows) => rows[0]);
    if (!produtoRow) throw new Error("Produto não encontrado.");

    const saldoRow = await tx
      .select()
      .from(estoqueSaldo)
      .where(and(
        eq(estoqueSaldo.orgId, ctx.orgId),
        eq(estoqueSaldo.produtoId, input.produtoId),
      ))
      .for("update")
      .then((rows) => rows[0]);

    if (!saldoRow) throw new Error("Produto sem saldo cadastrado.");

    // O lock do saldo serializa consumidores concorrentes do mesmo produto.
    // A checagem após o lock enxerga o movimento confirmado pelo primeiro job.
    if (input.referenciaId && input.referenciaTipo) {
      const existente = await tx
        .select()
        .from(estoqueMovimento)
        .where(and(
          eq(estoqueMovimento.orgId, ctx.orgId),
          eq(estoqueMovimento.produtoId, input.produtoId),
          eq(estoqueMovimento.referenciaId, input.referenciaId),
          eq(estoqueMovimento.referenciaTipo, input.referenciaTipo),
        ))
        .then((rows) => rows[0]);

      if (existente) {
        return {
          movimento: existente, novoSaldo: saldoRow.saldo, idempotente: true,
          eventoBaixa: null, eventoSaldo: null, eventoMinimo: null,
        };
      }
    }

    validarMovimento(saldoRow.saldo, input.tipo, input.quantidade);
    const novoSaldo = calcularNovoSaldo(saldoRow.saldo, input.tipo, input.quantidade);

    const [movimento] = await tx
      .insert(estoqueMovimento)
      .values({
        orgId: ctx.orgId,
        produtoId: input.produtoId,
        tipo: input.tipo,
        quantidade: input.quantidade,
        referenciaId: input.referenciaId,
        referenciaTipo: input.referenciaTipo,
        observacao: input.observacao,
      })
      .returning();

    await tx.insert(auditLog).values({
      orgId: ctx.orgId,
      brandId: produtoRow.brandId,
      autorId: ctx.userId,
      autorTipo: ctx.userId ? "usuario" : "sistema",
      entidade: "estoque_movimento",
      entidadeId: movimento.id,
      acao: "registrado",
      depois: movimento,
    });

    await tx
      .update(estoqueSaldo)
      .set({ saldo: novoSaldo, updatedAt: new Date() })
      .where(and(
        eq(estoqueSaldo.orgId, ctx.orgId),
        eq(estoqueSaldo.produtoId, input.produtoId),
      ));

    const eventoBaixa = input.tipo === "saida"
      ? await persistirEvento({
          tipo: "estoque.baixa_automatica",
          orgId: ctx.orgId,
          entidade: "estoque_movimento",
          entidadeId: movimento.id,
          payload: { produtoId: input.produtoId, tipo: input.tipo, quantidade: input.quantidade, novoSaldo },
        }, tx)
      : null;

    // Emitido para qualquer tipo de movimento — permite A4 sincronizar o saldo nos canais.
    const eventoSaldo = await persistirEvento({
      tipo: "estoque.saldo_atualizado",
      orgId: ctx.orgId,
      entidade: "estoque_saldo",
      entidadeId: input.produtoId,
      payload: { produtoId: input.produtoId, novoSaldo, tipoMovimento: input.tipo },
    }, tx);

    await persistirEvento({
      tipo: "estoque.movimento_registrado",
      orgId: ctx.orgId,
      brandId: produtoRow.brandId,
      entidade: "estoque_movimento",
      entidadeId: movimento.id,
      payload: { produtoId: input.produtoId, tipo: input.tipo, quantidade: input.quantidade, novoSaldo },
    }, tx);

    const eventoMinimo = saldoRow.saldo > produtoRow.estoqueMinimo && novoSaldo <= produtoRow.estoqueMinimo
      ? await persistirEvento({
          tipo: "estoque.minimo_atingido",
          orgId: ctx.orgId,
          brandId: produtoRow.brandId,
          entidade: "produto",
          entidadeId: produtoRow.id,
          payload: { produtoId: produtoRow.id, estoqueMinimo: produtoRow.estoqueMinimo, novoSaldo },
        }, tx)
      : null;

    return { movimento, novoSaldo, idempotente: false, eventoBaixa, eventoSaldo, eventoMinimo };
  });

  if (resultado.eventoBaixa) await despacharEvento(resultado.eventoBaixa);
  if (resultado.eventoSaldo) await despacharEvento(resultado.eventoSaldo);
  if (resultado.eventoMinimo) await despacharEvento(resultado.eventoMinimo);
  if (resultado.idempotente) {
    const recuperacao = await despacharEventosPendentes(ctx.orgId, 100);
    if (recuperacao.falhas > 0) {
      throw new Error(`Falha ao republicar ${recuperacao.falhas} evento(s) pendente(s) de estoque.`);
    }
  }

  return {
    movimento: resultado.movimento,
    novoSaldo: resultado.novoSaldo,
    idempotente: resultado.idempotente,
  };
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

  const [saldoRow, canaisVinculados, movimentos] = await Promise.all([
    ctx.db
      .select({ saldo: estoqueSaldo.saldo })
      .from(estoqueSaldo)
      .where(and(eq(estoqueSaldo.orgId, ctx.orgId), eq(estoqueSaldo.produtoId, produtoId)))
      .then((rows) => rows[0]?.saldo ?? 0),
    ctx.db
      .select({
        id: produtoCanal.id,
        externalListingId: produtoCanal.externalListingId,
        externalSkuId: produtoCanal.externalSkuId,
        ativo: produtoCanal.ativo,
        canalTipo: channelAccount.tipo,
      })
      .from(produtoCanal)
      .innerJoin(channelAccount, eq(channelAccount.id, produtoCanal.channelAccountId))
      .where(and(eq(produtoCanal.orgId, ctx.orgId), eq(produtoCanal.produtoId, produtoId))),
    ctx.db
      .select()
      .from(estoqueMovimento)
      .where(and(eq(estoqueMovimento.orgId, ctx.orgId), eq(estoqueMovimento.produtoId, produtoId)))
      .orderBy(desc(estoqueMovimento.createdAt))
      .limit(20),
  ]);

  return { produto: produtoRow, saldo: saldoRow, canais: canaisVinculados, movimentos };
}

export async function consultarSaldo(ctx: CrudContext, produtoId: string) {
  return ctx.db
    .select()
    .from(estoqueSaldo)
    .where(and(eq(estoqueSaldo.orgId, ctx.orgId), eq(estoqueSaldo.produtoId, produtoId)))
    .then((r) => r[0] ?? null);
}

// Divergências vêm da reconciliação noturna (job A5-reconciliacao-saldo): o
// saldo do canal (ex.: Mercado Livre) não bate com o saldo local. A correção
// nunca é automática — fica pendente até um admin decidir aplicar o valor do
// canal ou ignorar a diferença.
export async function listarDivergenciasEstoque(ctx: CrudContext) {
  assertPerfil(ctx, ["admin", "gestor"]);
  return ctx.db
    .select({
      id: estoqueDivergencia.id,
      produtoId: estoqueDivergencia.produtoId,
      produtoSku: produto.sku,
      produtoNome: produto.nome,
      channelAccountId: estoqueDivergencia.channelAccountId,
      canal: channelAccount.tipo,
      brandSlug: brand.slug,
      brandName: brand.name,
      saldoLocal: estoqueDivergencia.saldoLocal,
      saldoCanal: estoqueDivergencia.saldoCanal,
      createdAt: estoqueDivergencia.createdAt,
    })
    .from(estoqueDivergencia)
    .innerJoin(produto, eq(produto.id, estoqueDivergencia.produtoId))
    .innerJoin(channelAccount, eq(channelAccount.id, estoqueDivergencia.channelAccountId))
    .innerJoin(brand, eq(brand.id, channelAccount.brandId))
    .where(and(
      eq(estoqueDivergencia.orgId, ctx.orgId),
      eq(estoqueDivergencia.status, "pendente"),
    ))
    .orderBy(desc(estoqueDivergencia.createdAt));
}

export async function resolverDivergenciaEstoque(
  ctx: CrudContext,
  divergenciaId: string,
  decisao: "aplicar_canal" | "ignorar",
) {
  assertPerfil(ctx, ["admin", "gestor"]);

  const resultado = await ctx.db.transaction(async (tx) => {
    const divergenciaRow = await tx
      .select()
      .from(estoqueDivergencia)
      .where(and(
        eq(estoqueDivergencia.id, divergenciaId),
        eq(estoqueDivergencia.orgId, ctx.orgId),
        eq(estoqueDivergencia.status, "pendente"),
      ))
      .for("update")
      .then((rows) => rows[0]);
    if (!divergenciaRow) throw new Error("Divergência não encontrada ou já resolvida.");

    if (decisao === "ignorar") {
      await tx.update(estoqueDivergencia).set({
        status: "ignorada",
        resolvidoPorId: ctx.userId,
        resolvidoEm: new Date(),
      }).where(eq(estoqueDivergencia.id, divergenciaId));

      await tx.insert(auditLog).values({
        orgId: ctx.orgId,
        autorId: ctx.userId,
        autorTipo: ctx.userId ? "usuario" : "sistema",
        entidade: "estoque_divergencia",
        entidadeId: divergenciaId,
        acao: "ignorada",
        antes: { saldoLocal: divergenciaRow.saldoLocal, saldoCanal: divergenciaRow.saldoCanal },
      });
      return { status: "ignorada" as const, eventoSaldo: null };
    }

    const produtoRow = await tx
      .select({ id: produto.id, brandId: produto.brandId })
      .from(produto)
      .where(and(eq(produto.orgId, ctx.orgId), eq(produto.id, divergenciaRow.produtoId), isNull(produto.deletedAt)))
      .then((rows) => rows[0]);
    if (!produtoRow) throw new Error("Produto não encontrado.");

    const saldoRow = await tx
      .select()
      .from(estoqueSaldo)
      .where(and(eq(estoqueSaldo.orgId, ctx.orgId), eq(estoqueSaldo.produtoId, divergenciaRow.produtoId)))
      .for("update")
      .then((rows) => rows[0]);
    if (!saldoRow) throw new Error("Produto sem saldo cadastrado.");

    const novoSaldo = divergenciaRow.saldoCanal;
    if (novoSaldo < 0) throw new Error("Saldo do canal inválido para aplicar.");

    // O banco tem um check constraint (chk_movimento_quantidade_positiva) que
    // proíbe quantidade = 0 em estoque_movimento para qualquer tipo — inclusive
    // "ajuste". Quando o canal está zerado (anúncio esgotado), não há como
    // representar isso como um movimento; o audit_log abaixo já registra o
    // antes/depois, então só pulamos a linha de movimento nesse caso.
    const movimento = novoSaldo > 0
      ? await tx.insert(estoqueMovimento).values({
          orgId: ctx.orgId,
          produtoId: divergenciaRow.produtoId,
          tipo: "ajuste",
          quantidade: novoSaldo,
          referenciaId: divergenciaRow.id,
          referenciaTipo: "reconciliacao_estoque",
          observacao: `Aplicado saldo do canal após divergência (local ${saldoRow.saldo} → canal ${novoSaldo}).`,
        }).returning().then((rows) => rows[0])
      : null;

    await tx.update(estoqueSaldo).set({ saldo: novoSaldo, updatedAt: new Date() })
      .where(and(eq(estoqueSaldo.orgId, ctx.orgId), eq(estoqueSaldo.produtoId, divergenciaRow.produtoId)));

    await tx.update(estoqueDivergencia).set({
      status: "aplicada",
      resolvidoPorId: ctx.userId,
      resolvidoEm: new Date(),
    }).where(eq(estoqueDivergencia.id, divergenciaId));

    await tx.insert(auditLog).values({
      orgId: ctx.orgId,
      brandId: produtoRow.brandId,
      autorId: ctx.userId,
      autorTipo: ctx.userId ? "usuario" : "sistema",
      entidade: "estoque_divergencia",
      entidadeId: divergenciaId,
      acao: "aplicada",
      antes: { saldoLocal: saldoRow.saldo },
      depois: { saldoLocal: novoSaldo, movimentoId: movimento?.id ?? null },
    });

    const eventoSaldo = await persistirEvento({
      tipo: "estoque.saldo_atualizado",
      orgId: ctx.orgId,
      entidade: "estoque_saldo",
      entidadeId: divergenciaRow.produtoId,
      payload: { produtoId: divergenciaRow.produtoId, novoSaldo, tipoMovimento: "ajuste" },
    }, tx);

    return { status: "aplicada" as const, novoSaldo, eventoSaldo };
  });

  if (resultado.eventoSaldo) await despacharEvento(resultado.eventoSaldo);
  return resultado;
}
