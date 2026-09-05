import { eq, and, or, isNull, ilike, ne, desc, inArray, sql, SQL, asc } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { z } from "zod";
import { assertPerfil, createCrudFactory, type CrudContext } from "@/shared/lib/crud-factory";
import { db } from "@/shared/lib/db";
import {
  appUser, auditLog, brand, channelAccount, cliente, clienteIdentidade, clienteTag, consentimento, conversa, interacao,
  mensagem, pedido, pedidoItem, produto, scoreCliente, tag,
} from "@/shared/lib/db/schema";
import { emitirEvento } from "@/shared/events";
import { CANAIS_VENDA } from "@/shared/config/canais-venda";
import { compararPorOrdemDeMarca } from "@/shared/config/brands";
import {
  CreateClienteSchema, UpdateClienteSchema, CriarAnotacaoSchema, TIPO_INTERACAO_ANOTACAO,
  type CreateClienteDTO, type UpdateClienteDTO, type CriarAnotacaoDTO,
} from "../domain/entities";
import {
  normalizarTelefone, normalizarEmail, normalizarCpfCnpj,
  calcularScoreDeduplicacao, classificarDeduplicacao,
} from "../domain/identity";
import { STATUS_PEDIDO_FATURAVEL } from "@/modules/vendas/domain/status-faturamento";
import { valorFaturavelPedidoSql } from "@/modules/vendas/infrastructure/valor-faturamento.sql";

const PEDIDO_FATURAVEL = inArray(pedido.status, [...STATUS_PEDIDO_FATURAVEL]);

const crudCliente = createCrudFactory({
  table: cliente,
  entityName: "cliente",
  softDelete: true,
  allowedPerfis: {
    create: ["admin", "gestor", "vendedor"],
    update: ["admin", "gestor", "vendedor"],
    delete: ["admin", "gestor"],
    read: ["admin", "gestor", "vendedor"],
  },
});

export async function criarCliente(ctx: CrudContext, input: CreateClienteDTO) {
  const data = CreateClienteSchema.parse({
    ...input,
    telefone: input.telefone ? normalizarTelefone(input.telefone) : input.telefone,
    email: input.email ? normalizarEmail(input.email) : input.email,
    cpfCnpj: input.cpfCnpj ? normalizarCpfCnpj(input.cpfCnpj) : input.cpfCnpj,
  });

  const dedup = await verificarDeduplicacao(ctx.orgId, {
    telefone: data.telefone,
    email: data.email,
    cpfCnpj: data.cpfCnpj,
  });

  if (dedup.tipo === "exato") {
    throw new Error(`Cliente duplicado detectado: ID ${dedup.clienteIdExistente}`);
  }

  const novo = await crudCliente.create(ctx, data);

  await emitirEvento({
    tipo: "cliente.criado",
    orgId: ctx.orgId,
    entidade: "cliente",
    entidadeId: (novo as { id: string }).id,
    payload: novo,
  });

  return { cliente: novo, possiveisDuplicados: dedup.tipo === "possivel" ? [dedup] : [] };
}

export async function buscarClientePorId(ctx: CrudContext, id: string) {
  return crudCliente.getById(ctx, id);
}

export async function buscarCliente360(ctx: CrudContext, id: string) {
  const clienteAtual = await crudCliente.getById(ctx, id) as typeof cliente.$inferSelect | null;
  if (!clienteAtual) throw new Error("Cliente não encontrado.");

  const [interacoes, pedidos, consentimentos, tagsCliente, identidades, scoreRow, resumoRows, marcasRows, canaisRows, produtosRows, mensagensCliente, usuarios] = await Promise.all([
    ctx.db
      .select()
      .from(interacao)
      .where(and(eq(interacao.orgId, ctx.orgId), eq(interacao.clienteId, id)))
      .orderBy(desc(interacao.createdAt))
      .limit(50),
    ctx.db
      .select()
      .from(pedido)
      .where(and(eq(pedido.orgId, ctx.orgId), eq(pedido.clienteId, id)))
      .orderBy(desc(pedido.createdAt))
      .limit(50),
    ctx.db
      .select()
      .from(consentimento)
      .where(and(eq(consentimento.orgId, ctx.orgId), eq(consentimento.clienteId, id)))
      .orderBy(desc(consentimento.createdAt)),
    ctx.db
      .select({ id: tag.id, nome: tag.nome, cor: tag.cor })
      .from(clienteTag)
      .innerJoin(tag, eq(tag.id, clienteTag.tagId))
      .where(and(eq(tag.orgId, ctx.orgId), eq(clienteTag.clienteId, id))),
    ctx.db
      .select({ canal: clienteIdentidade.canal })
      .from(clienteIdentidade)
      .where(and(eq(clienteIdentidade.orgId, ctx.orgId), eq(clienteIdentidade.clienteId, id))),
    ctx.db
      .select({
        churnRisk: scoreCliente.churnRisk,
        segmento: scoreCliente.segmento,
        acaoSugerida: scoreCliente.acaoSugerida,
        proximaCompraEstimada: scoreCliente.proximaCompraEstimada,
        probabilidadeRecompra30d: scoreCliente.probabilidadeRecompra30d,
        calculadoEm: scoreCliente.calculadoEm,
      })
      .from(scoreCliente)
      .where(and(eq(scoreCliente.orgId, ctx.orgId), eq(scoreCliente.clienteId, id)))
      .then((rows) => rows[0] ?? null),
    ctx.db
      .select({
        totalPedidos: sql<number>`count(*)`,
        totalGasto: sql<string>`coalesce(sum(${valorFaturavelPedidoSql()}) filter (where ${PEDIDO_FATURAVEL}), 0)`,
        primeiroPedidoEm: sql<Date | null>`min(${pedido.createdAt})`,
        ultimoPedidoEm: sql<Date | null>`max(${pedido.createdAt})`,
        cancelados: sql<number>`count(*) filter (where ${pedido.status} = 'cancelado')`,
        devolvidos: sql<number>`count(*) filter (where ${pedido.status} = 'devolvido')`,
      })
      .from(pedido)
      .where(and(eq(pedido.orgId, ctx.orgId), eq(pedido.clienteId, id))),
    ctx.db
      .select({ id: brand.id, nome: brand.name, slug: brand.slug, total: sql<number>`count(*)` })
      .from(pedido)
      .innerJoin(brand, eq(brand.id, pedido.brandId))
      .where(and(eq(pedido.orgId, ctx.orgId), eq(pedido.clienteId, id)))
      .groupBy(brand.id, brand.name, brand.slug)
      .then((linhas) => linhas.sort(compararPorOrdemDeMarca)),
    ctx.db
      .select({ canal: pedido.canal, total: sql<number>`count(*)` })
      .from(pedido)
      .where(and(eq(pedido.orgId, ctx.orgId), eq(pedido.clienteId, id)))
      .groupBy(pedido.canal)
      .orderBy(desc(sql`count(*)`)),
    ctx.db
      .select({
        produtoId: produto.id,
        nome: produto.nome,
        quantidade: sql<number>`sum(${pedidoItem.quantidade})`,
      })
      .from(pedidoItem)
      .innerJoin(pedido, eq(pedido.id, pedidoItem.pedidoId))
      .innerJoin(produto, eq(produto.id, pedidoItem.produtoId))
      .where(and(eq(pedido.orgId, ctx.orgId), eq(pedido.clienteId, id)))
      .groupBy(produto.id, produto.nome)
      .orderBy(desc(sql`sum(${pedidoItem.quantidade})`))
      .limit(5),
    ctx.db
      .select({
        id: mensagem.id,
        conversaId: conversa.id,
        canal: channelAccount.tipo,
        direcao: mensagem.direcao,
        conteudo: mensagem.conteudo,
        status: conversa.status,
        createdAt: mensagem.createdAt,
      })
      .from(mensagem)
      .innerJoin(conversa, eq(conversa.id, mensagem.conversaId))
      .innerJoin(channelAccount, eq(channelAccount.id, conversa.channelAccountId))
      .where(and(eq(mensagem.orgId, ctx.orgId), eq(conversa.clienteId, id)))
      .orderBy(desc(mensagem.createdAt))
      .limit(50),
    ctx.db
      .select({ id: appUser.id, nome: appUser.nome })
      .from(appUser)
      .where(and(eq(appUser.orgId, ctx.orgId), eq(appUser.ativo, true)))
      .orderBy(asc(appUser.nome)),
  ]);

  const anotacoes = interacoes.filter((item) => item.tipo === TIPO_INTERACAO_ANOTACAO);
  const tarefas = interacoes.filter((item) => item.tipo === "tarefa");
  const timelineInteracoes = interacoes.filter((item) => item.tipo !== TIPO_INTERACAO_ANOTACAO && item.tipo !== "tarefa");

  // Canais únicos e ordenados: um cliente pode ter mais de uma identidade no
  // mesmo canal (ex.: dois pedidos com IDs de comprador diferentes), e a
  // bandeirinha do 360 mostra cada canal uma vez só.
  const canais = [...new Set(identidades.map((item) => item.canal))];
  const resumoBase = resumoRows[0];
  const totalPedidos = Number(resumoBase?.totalPedidos ?? 0);
  const totalGasto = Number(resumoBase?.totalGasto ?? 0);
  const ultimoPedidoEm = resumoBase?.ultimoPedidoEm ?? null;
  const diasSemComprar = ultimoPedidoEm
    ? Math.max(0, Math.floor((Date.now() - new Date(ultimoPedidoEm).getTime()) / 86_400_000))
    : null;
  const cancelados = Number(resumoBase?.cancelados ?? 0);
  const devolvidos = Number(resumoBase?.devolvidos ?? 0);

  const classificacaoRelacionamento = totalPedidos === 0
    ? { chave: "novo", label: "Novo", motivo: "Ainda não realizou uma compra." }
    : diasSemComprar !== null && diasSemComprar >= 180
      ? { chave: "inativo", label: "Inativo", motivo: `Sem comprar há ${diasSemComprar} dias.` }
      : diasSemComprar !== null && diasSemComprar >= 90
        ? { chave: "em_risco", label: "Em risco", motivo: `Sem comprar há ${diasSemComprar} dias.` }
        : totalPedidos >= 5 || totalGasto >= 2_000
          ? { chave: "vip", label: "VIP", motivo: `${totalPedidos} pedidos e ${totalGasto.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} em compras.` }
          : totalPedidos >= 2
            ? { chave: "recorrente", label: "Recorrente", motivo: `${totalPedidos} compras registradas.` }
            : { chave: "novo", label: "Novo", motivo: "Primeira compra registrada." };

  return {
    cliente: clienteAtual,
    interacoes: timelineInteracoes,
    anotacoes,
    pedidos,
    consentimentos,
    tags: tagsCliente,
    canais,
    score: scoreRow,
    resumoComercial: {
      totalPedidos,
      totalGasto,
      ticketMedio: totalPedidos > 0 ? totalGasto / totalPedidos : 0,
      primeiroPedidoEm: resumoBase?.primeiroPedidoEm ?? null,
      ultimoPedidoEm,
      diasSemComprar,
      cancelados,
      devolvidos,
      marcaPreferida: marcasRows[0] ?? null,
      canalPreferido: canaisRows[0] ?? null,
      produtosMaisComprados: produtosRows.map((item) => ({ ...item, quantidade: Number(item.quantidade) })),
    },
    classificacaoRelacionamento,
    mensagens: mensagensCliente,
    tarefas,
    usuarios,
  };
}

const TarefaClienteSchema = z.object({
  clienteId: z.string().uuid(),
  titulo: z.string().trim().min(3).max(240),
  responsavelId: z.string().uuid().nullable().optional(),
  prazo: z.string().datetime().nullable().optional(),
});

export async function criarTarefaCliente(ctx: CrudContext, input: z.input<typeof TarefaClienteSchema>) {
  const data = TarefaClienteSchema.parse(input);
  const clienteValido = await ctx.db.select({ id: cliente.id }).from(cliente).where(and(eq(cliente.id, data.clienteId), eq(cliente.orgId, ctx.orgId), isNull(cliente.deletedAt))).then((rows) => rows[0]);
  if (!clienteValido) throw new Error("Cliente não encontrado.");
  if (data.responsavelId) {
    const responsavel = await ctx.db.select({ id: appUser.id }).from(appUser).where(and(eq(appUser.id, data.responsavelId), eq(appUser.orgId, ctx.orgId), eq(appUser.ativo, true))).then((rows) => rows[0]);
    if (!responsavel) throw new Error("Responsável inválido.");
  }
  const [nova] = await ctx.db.insert(interacao).values({
    clienteId: data.clienteId, orgId: ctx.orgId, tipo: "tarefa", resumo: data.titulo, autorId: ctx.userId,
    meta: { status: "pendente", responsavelId: data.responsavelId ?? null, prazo: data.prazo ?? null },
  }).returning();
  return nova;
}

export async function concluirTarefaCliente(ctx: CrudContext, clienteId: string, tarefaId: string) {
  const atual = await ctx.db.select().from(interacao).where(and(eq(interacao.id, tarefaId), eq(interacao.clienteId, clienteId), eq(interacao.orgId, ctx.orgId), eq(interacao.tipo, "tarefa"))).then((rows) => rows[0]);
  if (!atual) throw new Error("Tarefa não encontrada.");
  const meta = (atual.meta ?? {}) as Record<string, unknown>;
  const [tarefa] = await ctx.db.update(interacao).set({ meta: { ...meta, status: "concluida", concluidaEm: new Date().toISOString(), concluidaPorId: ctx.userId ?? null } }).where(eq(interacao.id, tarefaId)).returning();
  return tarefa;
}

export async function criarAnotacaoCliente(ctx: CrudContext, input: CriarAnotacaoDTO) {
  const data = CriarAnotacaoSchema.parse(input);

  const clienteValido = await ctx.db.select({ id: cliente.id }).from(cliente).where(and(
    eq(cliente.id, data.clienteId), eq(cliente.orgId, ctx.orgId), isNull(cliente.deletedAt),
  )).then((rows) => rows[0]);
  if (!clienteValido) throw new Error("Cliente não encontrado.");

  const [nova] = await ctx.db.insert(interacao).values({
    clienteId: data.clienteId,
    orgId: ctx.orgId,
    tipo: TIPO_INTERACAO_ANOTACAO,
    resumo: data.texto,
    autorId: ctx.userId,
  }).returning();

  await ctx.db.insert(auditLog).values({
    orgId: ctx.orgId,
    autorId: ctx.userId,
    autorTipo: ctx.userId ? "usuario" : "sistema",
    entidade: "interacao",
    entidadeId: nova.id,
    acao: "create",
    depois: nova,
  });

  await emitirEvento({
    tipo: "cliente.anotacao_registrada",
    orgId: ctx.orgId,
    entidade: "cliente",
    entidadeId: data.clienteId,
    payload: { interacaoId: nova.id },
  });

  return nova;
}

export async function exportarDadosCliente(ctx: CrudContext, id: string) {
  assertPerfil(ctx, ["admin", "gestor"]);
  const data = await buscarCliente360(ctx, id);

  await ctx.db.insert(auditLog).values({
    orgId: ctx.orgId,
    autorId: ctx.userId,
    autorTipo: ctx.userId ? "usuario" : "sistema",
    entidade: "cliente",
    entidadeId: id,
    acao: "lgpd_exportacao",
    depois: { clienteId: id, geradoEm: new Date().toISOString() },
  });

  return {
    tipo: "lgpd_exportacao_cliente",
    geradoEm: new Date().toISOString(),
    orgId: ctx.orgId,
    dados: data,
  };
}

/** Cliente não tem coluna de marca própria — quem carrega essa relação é o
 *  pedido (todo pedido nasce com brandId). "Empresa do cliente" então é lida
 *  como "empresa de quem ele já comprou", via EXISTS: um cliente com pedidos
 *  em mais de uma marca entra no filtro se qualquer uma delas estiver
 *  marcada, o mesmo OR-entre-marcas usado no seletor do Estoque. */
function condicaoMarcaCliente(orgId: string, brandIds: readonly string[]): SQL {
  return sql`exists (
    select 1 from ${pedido}
    where ${pedido.clienteId} = ${cliente.id}
      and ${pedido.orgId} = ${orgId}
      and ${inArray(pedido.brandId, brandIds)}
  )`;
}

/** Espelha condicaoCanal do Estoque, mas em cima de cliente_identidade em vez
 *  de produto_canal: cliente entra se tiver identidade em qualquer um dos
 *  canais marcados. Recebe a coluna de clienteId a correlacionar porque é
 *  usada em dois contextos de query diferentes — listarClientes tem `cliente`
 *  no FROM, mas contarClientesPorMarca parte de `brand`/`pedido` sem juntar
 *  `cliente`; fixar a referência em `cliente.id` ali quebrava a consulta com
 *  "invalid reference to FROM-clause entry for table cliente" (engolido pelo
 *  catch do front, que então esvaziava a barra de Empresa inteira). */
function condicaoCanalCliente(orgId: string, canalTipos: readonly string[], clienteIdCol: SQL | AnyPgColumn = cliente.id): SQL {
  return sql`exists (
    select 1 from ${clienteIdentidade}
    where ${clienteIdentidade.clienteId} = ${clienteIdCol}
      and ${clienteIdentidade.orgId} = ${orgId}
      and ${inArray(clienteIdentidade.canal, canalTipos as (typeof CANAIS_VENDA)[number][])}
  )`;
}

export async function listarClientes(
  ctx: CrudContext,
  opts: { busca?: string; brandIds?: string[]; canalTipos?: string[]; limit?: number; offset?: number } = {}
) {
  const filters = [];

  if (opts.busca) {
    filters.push(
      or(
        ilike(cliente.nome, `%${opts.busca}%`),
        // nome_completo é o nome real do destinatário (Mercado Livre); nome
        // sozinho é só o apelido do comprador — sem isto, buscar pelo nome de
        // verdade de alguém não encontraria o cadastro.
        ilike(cliente.nomeCompleto, `%${opts.busca}%`),
        ilike(cliente.email, `%${opts.busca}%`),
        ilike(cliente.telefone, `%${opts.busca}%`)
      )!
    );
  }
  if (opts.brandIds && opts.brandIds.length > 0) filters.push(condicaoMarcaCliente(ctx.orgId, opts.brandIds));
  if (opts.canalTipos && opts.canalTipos.length > 0) filters.push(condicaoCanalCliente(ctx.orgId, opts.canalTipos));

  const result = await crudCliente.list(ctx, {
    limit: opts.limit,
    offset: opts.offset,
    filters,
  });

  const linhas = result.data as Array<Record<string, unknown> & { id: string }>;
  const ids = linhas.map((item) => item.id);
  if (ids.length === 0) return { ...result, data: linhas as Array<Record<string, unknown> & { id: string; canais: string[] }> };

  // Bandeirinha discreta ao lado do nome: uma consulta leve à parte, em vez de
  // juntar cliente_identidade na busca principal — o join duplicaria a linha
  // do cliente por canal e quebraria o limit/offset da paginação.
  const [identidades, resumoClientes] = await Promise.all([
    ctx.db
      .select({ clienteId: clienteIdentidade.clienteId, canal: clienteIdentidade.canal })
      .from(clienteIdentidade)
      .where(and(eq(clienteIdentidade.orgId, ctx.orgId), inArray(clienteIdentidade.clienteId, ids))),
    ctx.db
      .select({
        clienteId: pedido.clienteId,
        totalPedidos: sql<number>`count(*)`,
        totalGasto: sql<string>`coalesce(sum(${valorFaturavelPedidoSql()}) filter (where ${PEDIDO_FATURAVEL}), 0)`,
        ultimoPedidoEm: sql<Date | null>`max(${pedido.createdAt})`,
      })
      .from(pedido)
      .where(and(eq(pedido.orgId, ctx.orgId), inArray(pedido.clienteId, ids)))
      .groupBy(pedido.clienteId),
  ]);

  const canaisPorCliente = new Map<string, string[]>();
  for (const item of identidades) {
    const atual = canaisPorCliente.get(item.clienteId) ?? [];
    if (!atual.includes(item.canal)) atual.push(item.canal);
    canaisPorCliente.set(item.clienteId, atual);
  }
  const resumoPorCliente = new Map(resumoClientes.map((item) => [item.clienteId, item]));

  return {
    ...result,
    data: (result.data as Array<Record<string, unknown> & { id: string }>).map((item) => {
      const resumo = resumoPorCliente.get(item.id);
      const totalPedidos = Number(resumo?.totalPedidos ?? 0);
      const totalGasto = Number(resumo?.totalGasto ?? 0);
      const ultimoPedidoEm = resumo?.ultimoPedidoEm ?? null;
      const diasSemComprar = ultimoPedidoEm ? Math.max(0, Math.floor((Date.now() - new Date(ultimoPedidoEm).getTime()) / 86_400_000)) : null;
      const relacionamento = totalPedidos === 0 ? "Novo"
        : diasSemComprar !== null && diasSemComprar >= 180 ? "Inativo"
          : diasSemComprar !== null && diasSemComprar >= 90 ? "Em risco"
            : totalPedidos >= 5 || totalGasto >= 2_000 ? "VIP"
              : totalPedidos >= 2 ? "Recorrente" : "Novo";
      return {
        ...item,
        canais: canaisPorCliente.get(item.id) ?? [],
        resumoComercial: { totalPedidos, totalGasto, ultimoPedidoEm, relacionamento },
      };
    }),
  };
}

/** Alimenta o seletor de canal da barra de escopo em Clientes, espelhando
 *  contarProdutosPorCanal do Estoque: mesma leitura de conexão por conta,
 *  mesma contagem cruzada com a marca ativa (quando houver). */
export async function contarClientesPorCanal(ctx: CrudContext, opts: { brandIds?: string[] } = {}) {
  const contas = await ctx.db
    .select({ tipo: channelAccount.tipo, status: channelAccount.status })
    .from(channelAccount)
    .where(eq(channelAccount.orgId, ctx.orgId));

  const conectadoPorTipo = new Map<string, boolean>();
  for (const conta of contas) {
    if (conta.status === "conectado") conectadoPorTipo.set(conta.tipo, true);
    else if (!conectadoPorTipo.has(conta.tipo)) conectadoPorTipo.set(conta.tipo, false);
  }

  const filtroMarca = opts.brandIds && opts.brandIds.length > 0
    ? [condicaoMarcaCliente(ctx.orgId, opts.brandIds)]
    : [];

  const contagens = await ctx.db
    .select({ tipo: clienteIdentidade.canal, total: sql<number>`count(distinct ${clienteIdentidade.clienteId})` })
    .from(clienteIdentidade)
    .innerJoin(cliente, and(eq(cliente.id, clienteIdentidade.clienteId), isNull(cliente.deletedAt), ...filtroMarca))
    .where(eq(clienteIdentidade.orgId, ctx.orgId))
    .groupBy(clienteIdentidade.canal);
  const totalPorTipo = new Map(contagens.map((linha) => [linha.tipo, Number(linha.total)]));

  return CANAIS_VENDA.map((tipo) => ({
    tipo,
    conectado: conectadoPorTipo.get(tipo) ?? false,
    total: totalPorTipo.get(tipo) ?? 0,
  }));
}

/** Alimenta o seletor de marca da barra de escopo em Clientes, espelhando
 *  contarProdutosPorMarca do Estoque — mesmo LEFT JOIN a partir da marca
 *  (marca sem cliente no canal ativo continua na lista, com zero). */
export async function contarClientesPorMarca(ctx: CrudContext, opts: { canalTipos?: string[] } = {}) {
  const filtroCanal = opts.canalTipos && opts.canalTipos.length > 0
    ? [condicaoCanalCliente(ctx.orgId, opts.canalTipos, pedido.clienteId)]
    : [];

  return ctx.db
    .select({
      brandId: brand.id,
      name: brand.name,
      slug: brand.slug,
      total: sql<number>`count(distinct ${pedido.clienteId})`,
    })
    .from(brand)
    .leftJoin(pedido, and(eq(pedido.brandId, brand.id), eq(pedido.orgId, ctx.orgId), ...filtroCanal))
    .where(and(eq(brand.orgId, ctx.orgId), eq(brand.active, true)))
    .groupBy(brand.id, brand.name, brand.slug)
    .then((linhas) => linhas
      .map((linha) => ({ ...linha, total: Number(linha.total) }))
      .sort(compararPorOrdemDeMarca));
}

export async function atualizarCliente(ctx: CrudContext, id: string, input: UpdateClienteDTO) {
  const data = UpdateClienteSchema.parse({
    ...input,
    telefone: input.telefone ? normalizarTelefone(input.telefone) : input.telefone,
    email: input.email ? normalizarEmail(input.email) : input.email,
    cpfCnpj: input.cpfCnpj ? normalizarCpfCnpj(input.cpfCnpj) : input.cpfCnpj,
  });

  const dedup = await verificarDeduplicacao(ctx.orgId, {
    telefone: data.telefone,
    email: data.email,
    cpfCnpj: data.cpfCnpj,
  }, id);
  if (dedup.tipo === "exato") {
    throw new Error(`Cliente duplicado detectado: ID ${dedup.clienteIdExistente}`);
  }

  const atualizado = await crudCliente.update(ctx, id, data);
  await emitirEvento({
    tipo: "cliente.atualizado",
    orgId: ctx.orgId,
    entidade: "cliente",
    entidadeId: id,
    payload: { campos: Object.keys(data) },
  });
  return atualizado;
}

export async function arquivarCliente(ctx: CrudContext, id: string) {
  const arquivado = await crudCliente.softDeleteById(ctx, id);
  await emitirEvento({
    tipo: "cliente.arquivado",
    orgId: ctx.orgId,
    entidade: "cliente",
    entidadeId: id,
    payload: { arquivado: true },
  });
  return arquivado;
}

async function verificarDeduplicacao(
  orgId: string,
  chaves: { telefone?: string | null; email?: string | null; cpfCnpj?: string | null },
  ignorarClienteId?: string,
) {
  const conditions = [];
  if (chaves.telefone) conditions.push(eq(cliente.telefone, chaves.telefone));
  if (chaves.email) conditions.push(eq(cliente.email, chaves.email));
  if (chaves.cpfCnpj) conditions.push(eq(cliente.cpfCnpj, chaves.cpfCnpj));

  if (conditions.length === 0) return { tipo: "novo" as const };

  const escopo = [eq(cliente.orgId, orgId), isNull(cliente.deletedAt), or(...conditions)!];
  if (ignorarClienteId) escopo.push(ne(cliente.id, ignorarClienteId));

  const candidatos = await db
    .select()
    .from(cliente)
    .where(and(...escopo));

  if (candidatos.length === 0) return { tipo: "novo" as const };

  let melhorScore = 0;
  let melhorId = "";
  for (const c of candidatos) {
    const score = calcularScoreDeduplicacao(chaves, {
      telefone: c.telefone,
      email: c.email,
      cpfCnpj: c.cpfCnpj,
    });
    if (score > melhorScore) { melhorScore = score; melhorId = c.id; }
  }

  return {
    tipo: classificarDeduplicacao(melhorScore),
    clienteIdExistente: melhorId,
    score: melhorScore,
  };
}

export async function registrarConsentimento(
  ctx: CrudContext,
  input: {
    clienteId: string;
    brandId: string;
    finalidade: "marketing" | "avaliacao" | "suporte" | "cobranca";
    canal: string;
    origem: string;
    prova?: string;
  }
) {
  const inputSchema = z.object({
    clienteId: z.string().uuid(),
    brandId: z.string().uuid(),
    finalidade: z.enum(["marketing", "avaliacao", "suporte", "cobranca"]),
    canal: z.enum(["instagram", "facebook", "email", "mercadolivre", "shopee", "tiktokshop", "manual"]),
    origem: z.string().trim().min(1).max(120),
    prova: z.string().trim().max(500).optional(),
  }).parse(input);

  const [clienteValido, marcaValida] = await Promise.all([
    ctx.db.select({ id: cliente.id }).from(cliente).where(and(
      eq(cliente.id, inputSchema.clienteId), eq(cliente.orgId, ctx.orgId), isNull(cliente.deletedAt),
    )).then((rows) => rows[0]),
    ctx.db.select({ id: brand.id }).from(brand).where(and(
      eq(brand.id, inputSchema.brandId), eq(brand.orgId, ctx.orgId), eq(brand.active, true),
    )).then((rows) => rows[0]),
  ]);
  if (!clienteValido || !marcaValida) throw new Error("Cliente ou marca não pertence à organização.");

  const [novo] = await db
    .insert(consentimento)
    .values({
      clienteId: inputSchema.clienteId,
      orgId: ctx.orgId,
      brandId: inputSchema.brandId,
      finalidade: inputSchema.finalidade,
      canal: inputSchema.canal,
      status: "ativo",
      origem: inputSchema.origem,
      prova: inputSchema.prova,
    })
    .returning();

  await ctx.db.insert(auditLog).values({
    orgId: ctx.orgId,
    brandId: inputSchema.brandId,
    autorId: ctx.userId,
    autorTipo: ctx.userId ? "usuario" : "sistema",
    entidade: "consentimento",
    entidadeId: novo.id,
    acao: "registrado",
    depois: novo,
  });

  await emitirEvento({
    tipo: "cliente.consentimento_registrado",
    orgId: ctx.orgId,
    brandId: inputSchema.brandId,
    entidade: "consentimento",
    entidadeId: novo.id,
    payload: { clienteId: inputSchema.clienteId, finalidade: inputSchema.finalidade, canal: inputSchema.canal },
  });

  return novo;
}

export async function revogarConsentimento(ctx: CrudContext, consentimentoId: string) {
  assertPerfil(ctx, ["admin", "gestor"]);
  const anterior = await ctx.db.select().from(consentimento).where(and(
    eq(consentimento.id, consentimentoId),
    eq(consentimento.orgId, ctx.orgId),
  )).then((rows) => rows[0]);

  const [atualizado] = await db
    .update(consentimento)
    .set({ status: "revogado", revokedAt: new Date() })
    .where(and(eq(consentimento.id, consentimentoId), eq(consentimento.orgId, ctx.orgId)))
    .returning();

  if (!atualizado) throw new Error("Consentimento não encontrado.");

  await ctx.db.insert(auditLog).values({
    orgId: ctx.orgId,
    brandId: atualizado.brandId,
    autorId: ctx.userId,
    autorTipo: ctx.userId ? "usuario" : "sistema",
    entidade: "consentimento",
    entidadeId: consentimentoId,
    acao: "revogado",
    antes: anterior,
    depois: atualizado,
  });

  await emitirEvento({
    tipo: "cliente.consentimento_revogado",
    orgId: ctx.orgId,
    entidade: "consentimento",
    entidadeId: consentimentoId,
    payload: { clienteId: atualizado.clienteId },
  });

  return atualizado;
}
