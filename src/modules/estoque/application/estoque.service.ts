import { and, count, desc, eq, gt, ilike, inArray, isNull, SQL, sql } from "drizzle-orm";
import { assertPerfil, type CrudContext } from "@/shared/lib/crud-factory";
import {
  auditLog, brand, channelAccount, produto, produtoCanal, estoqueDivergencia, estoqueSaldo, estoqueMovimento,
} from "@/shared/lib/db/schema";
import { despacharEvento, despacharEventosPendentes, persistirEvento } from "@/shared/events";
import { calcularScoreProduto } from "@/modules/scoring/domain/encalhe";
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

// Só nome/preço mudam o que é anunciado nos canais — custo e estoqueMinimo
// são internos e não disparam sincronização de anúncio.
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
      custo: data.custo,
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
 *  produto por anúncio mapeado. */
function condicaoCanal(orgId: string, canalTipo: string): SQL {
  return sql`exists (
    select 1 from ${produtoCanal}
    inner join ${channelAccount} on ${channelAccount.id} = ${produtoCanal.channelAccountId}
    where ${produtoCanal.produtoId} = ${produto.id}
      and ${produtoCanal.orgId} = ${orgId}
      and ${produtoCanal.ativo} = true
      and ${channelAccount.tipo} = ${canalTipo}
  )`;
}

export async function listarProdutos(
  ctx: CrudContext,
  opts: {
    brandId?: string;
    busca?: string;
    estado?: EstadoEstoque;
    canalTipo?: string;
    ids?: string[];
    limit?: number;
    offset?: number;
  } = {},
) {
  assertPerfil(ctx, ["admin", "gestor", "vendedor"]);
  const { limit = 50, offset = 0 } = opts;
  const filters: SQL[] = [eq(produto.orgId, ctx.orgId), isNull(produto.deletedAt)];
  if (opts.brandId) filters.push(eq(produto.brandId, opts.brandId));
  if (opts.busca) filters.push(ilike(sql`${produto.sku} || ' ' || ${produto.nome}`, `%${opts.busca}%`));
  if (opts.estado) filters.push(condicaoEstado(opts.estado));
  if (opts.canalTipo) filters.push(condicaoCanal(ctx.orgId, opts.canalTipo));
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
        custo: produto.custo,
        preco: produto.preco,
        estoqueMinimo: produto.estoqueMinimo,
        ativo: produto.ativo,
        createdAt: produto.createdAt,
        updatedAt: produto.updatedAt,
        saldo: SALDO,
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
  opts: { brandId?: string; canalTipo?: string } = {},
) {
  assertPerfil(ctx, ["admin", "gestor", "vendedor"]);
  const filters: SQL[] = [eq(produto.orgId, ctx.orgId), isNull(produto.deletedAt)];
  if (opts.brandId) filters.push(eq(produto.brandId, opts.brandId));
  if (opts.canalTipo) filters.push(condicaoCanal(ctx.orgId, opts.canalTipo));

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

// Ordem de venda fechada do PRD (§M3): Mercado Livre, Shopee, TikTok Shop —
// Olist fica de fora do seletor porque não é canal de anúncio próprio (é hub).
const CANAIS_VENDA = ["mercadolivre", "shopee", "tiktokshop"] as const;

/** Alimenta o seletor de canal no topo da tela. Cada entrada diz se a conta
 *  está de fato conectada (não apenas cadastrada) e quantos SKUs têm anúncio
 *  mapeado nela — sem isso o seletor não sabe o que desabilitar nem o que
 *  mostrar como contagem na pílula. */
export async function contarProdutosPorCanal(ctx: CrudContext) {
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
    .innerJoin(produto, and(eq(produto.id, produtoCanal.produtoId), isNull(produto.deletedAt)))
    .where(and(eq(produtoCanal.orgId, ctx.orgId), eq(produtoCanal.ativo, true)))
    .groupBy(channelAccount.tipo);
  const totalPorTipo = new Map(contagens.map((linha) => [linha.tipo, Number(linha.total)]));

  return CANAIS_VENDA.map((tipo) => ({
    tipo,
    conectado: conectadoPorTipo.get(tipo) ?? false,
    total: totalPorTipo.get(tipo) ?? 0,
  }));
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

// Mesma fórmula de risco do job A7-encalhe (src/modules/jobs/A7-encalhe.ts),
// mas calculada em lote e sob demanda para alimentar o indicador da tela de
// Estoque — o job noturno só emite o evento, não persiste um status.
export async function listarProdutosParados(ctx: CrudContext) {
  assertPerfil(ctx, ["admin", "gestor", "vendedor"]);

  const candidatos = await ctx.db
    .select({
      id: produto.id, sku: produto.sku, nome: produto.nome, custo: produto.custo,
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
        diasSemVenda, giroMensalMedio: 0, saldoAtual: item.saldo, custoUnitario: parseFloat(item.custo ?? "0"),
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
