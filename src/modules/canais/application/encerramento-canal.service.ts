import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/shared/lib/db";
import { assertPerfil, type CrudContext } from "@/shared/lib/crud-factory";
import { camposAnonimizadosCliente } from "@/modules/clientes/domain/anonimizacao";
import {
  auditLog,
  brand,
  channelAccount,
  cliente,
  clienteIdentidade,
  consentimento,
  exclusaoCanalAutorizacao,
  interacao,
  pedido,
} from "@/shared/lib/db/schema";

/** O tipo de canal vira o valor do enum `canal_tipo` usado em
 *  `cliente_identidade`. Só os canais de venda têm identidade de comprador;
 *  os demais não deixam rastro de titular para apagar. */
const CANAL_DA_CONTA: Record<string, "mercadolivre" | "shopee" | "tiktokshop" | undefined> = {
  mercadolivre: "mercadolivre",
  shopee: "shopee",
  tiktokshop: "tiktokshop",
};

export type CanalEncerramento = {
  id: string;
  tipo: string;
  nome: string;
  /** Slug da marca dona da conta. A tela colore a linha com a cor da marca
   *  (brands.json) — saber de quem é o dado é parte de decidir apagá-lo. */
  brandSlug: string;
  status: string;
  encerradoEm: Date | null;
  dadosExcluidosEm: Date | null;
  assinaturas: number;
  /** Quantos compradores seriam anonimizados hoje se a exclusão rodasse.
   *  Aparece na tela ANTES de qualquer assinatura porque autorizar sem saber
   *  o tamanho do estrago não é autorizar, é chutar. */
  clientesAfetados: number;
};

/** Lista as contas com o estado do encerramento, para a tela de Configurações.
 *
 *  Consulta própria, e não um campo a mais em `listarConfiguracaoCanais`,
 *  porque aquela lista é montada por marca × canal e devolve também canal que
 *  ainda nem tem conta criada — forma errada para esta tela, que trata de
 *  conta existente com dado dentro. */
export async function listarCanaisEncerramento(ctx: CrudContext): Promise<CanalEncerramento[]> {
  assertPerfil(ctx, ["admin"]);

  const linhas = await ctx.db.execute<{
    id: string; tipo: string; nome: string; brand_slug: string; status: string;
    encerrado_em: Date | null; dados_excluidos_em: Date | null;
    assinaturas: number; clientes_afetados: number;
  }>(sql`
    select
      c.id, c.tipo, c.nome, b.slug as brand_slug, c.status,
      c.encerrado_em, c.dados_excluidos_em,
      (select count(*)::int from ${exclusaoCanalAutorizacao} a
         where a.channel_account_id = c.id) as assinaturas,
      (select count(distinct p.cliente_id)::int from ${pedido} p
         where p.org_id = ${ctx.orgId} and p.channel_account_id = c.id) as clientes_afetados
    from ${channelAccount} c
    join ${brand} b on b.id = c.brand_id
    where c.org_id = ${ctx.orgId}
    order by c.tipo, clientes_afetados desc, c.nome
  `);

  return linhas.map((l) => ({
    id: l.id,
    tipo: l.tipo,
    nome: l.nome,
    brandSlug: l.brand_slug,
    status: l.status,
    encerradoEm: l.encerrado_em,
    dadosExcluidosEm: l.dados_excluidos_em,
    assinaturas: l.assinaturas,
    clientesAfetados: l.clientes_afetados,
  }));
}

/** Declara que a relação com este canal acabou. Não apaga nada — só liga o
 *  estado que permite as assinaturas e, depois delas, a exclusão.
 *
 *  É um campo à parte de propósito, e não `status = "desconectado"`: o status
 *  cai sozinho por token expirado ou canal fora do ar, e em 27/08/2026 seis
 *  das quinze contas estavam nesse estado sem que ninguém tivesse encerrado
 *  relação nenhuma. Encerrar é declaração de vontade, não sintoma. */
export async function encerrarRelacaoCanal(ctx: CrudContext, channelAccountId: string) {
  assertPerfil(ctx, ["admin"]);
  const agora = new Date();

  const [conta] = await ctx.db
    .select({ id: channelAccount.id, encerradoEm: channelAccount.encerradoEm })
    .from(channelAccount)
    .where(and(eq(channelAccount.id, channelAccountId), eq(channelAccount.orgId, ctx.orgId)));
  if (!conta) throw new Error("Conta de canal nao encontrada.");
  if (conta.encerradoEm) return conta;

  await ctx.db.update(channelAccount)
    .set({ encerradoEm: agora, updatedAt: agora })
    .where(and(eq(channelAccount.id, channelAccountId), eq(channelAccount.orgId, ctx.orgId)));

  await ctx.db.insert(auditLog).values({
    orgId: ctx.orgId,
    autorId: ctx.userId,
    autorTipo: ctx.userId ? "usuario" : "sistema",
    entidade: "channel_account",
    entidadeId: channelAccountId,
    acao: "relacao_encerrada",
    depois: { encerradoEm: agora.toISOString() },
  });

  return { id: channelAccountId, encerradoEm: agora };
}

/** Desfaz o encerramento e derruba as assinaturas já dadas.
 *
 *  As assinaturas caem porque valiam para AQUELE encerramento. Se ficassem,
 *  um encerramento futuro nasceria com autorizações que ninguém daquele
 *  momento reviu — que é exatamente o que o portão de três pessoas existe
 *  para impedir. Só funciona enquanto a exclusão não foi executada; depois
 *  dela não há o que reabrir. */
export async function reabrirRelacaoCanal(ctx: CrudContext, channelAccountId: string) {
  assertPerfil(ctx, ["admin"]);

  const [conta] = await ctx.db
    .select({ id: channelAccount.id, dadosExcluidosEm: channelAccount.dadosExcluidosEm })
    .from(channelAccount)
    .where(and(eq(channelAccount.id, channelAccountId), eq(channelAccount.orgId, ctx.orgId)));
  if (!conta) throw new Error("Conta de canal nao encontrada.");
  if (conta.dadosExcluidosEm) {
    throw new Error("Os dados deste canal ja foram excluidos; nao ha o que reabrir.");
  }

  await ctx.db.update(channelAccount)
    .set({ encerradoEm: null, updatedAt: new Date() })
    .where(and(eq(channelAccount.id, channelAccountId), eq(channelAccount.orgId, ctx.orgId)));

  await ctx.db.delete(exclusaoCanalAutorizacao).where(and(
    eq(exclusaoCanalAutorizacao.orgId, ctx.orgId),
    eq(exclusaoCanalAutorizacao.channelAccountId, channelAccountId),
  ));

  await ctx.db.insert(auditLog).values({
    orgId: ctx.orgId,
    autorId: ctx.userId,
    autorTipo: ctx.userId ? "usuario" : "sistema",
    entidade: "channel_account",
    entidadeId: channelAccountId,
    acao: "relacao_reaberta",
  });

  return { id: channelAccountId };
}

export type ResultadoExclusaoCanal = {
  channelAccountId: string;
  /** Compradores que só existiam por causa deste canal — anonimizados. */
  clientesAnonimizados: number;
  /** Compradores que também compraram por outro canal — preservados, mas o
   *  vínculo com ESTE canal foi cortado. */
  clientesPreservados: number;
  identidadesRemovidas: number;
};

/** Apaga o dado pessoal que veio de uma conta de canal cuja relação acabou.
 *
 *  NÃO é chamada por nenhuma rotina automática, de propósito. O único caminho
 *  até aqui passa por `executarExclusaoCanal`, que exige três admins distintos
 *  autorizando com a própria senha — ver autorizacao-exclusao.service.ts. A
 *  operação é irreversível e ninguém quer descobrir de manhã que um cron
 *  anonimizou o histórico de um canal por causa de um campo mal preenchido.
 *
 *  O pedido em si NÃO é apagado: valor, itens e datas seguem de pé porque a
 *  guarda fiscal exige e porque Métricas leria um buraco no faturamento
 *  histórico. O que some é o vínculo com a pessoa — nome, endereço, telefone,
 *  documento e o identificador do comprador na plataforma. Depois disto o
 *  pedido é um número sem dono, que é exatamente o que "excluir os dados do
 *  usuário" significa aqui.
 *
 *  A regra que exige cuidado: um comprador pode ter comprado na Shopee E no
 *  Mercado Livre. Anonimizá-lo por causa da Shopee destruiria dado de um
 *  canal ainda ativo. Por isso só é anonimizado quem NÃO tem nenhum pedido
 *  fora desta conta; quem tem, mantém o cadastro e perde apenas a identidade
 *  daquele canal. */
export async function excluirDadosDaConta(
  orgId: string,
  channelAccountId: string,
): Promise<ResultadoExclusaoCanal> {
  const agora = new Date();

  return db.transaction(async (tx) => {
    const [conta] = await tx
      .select({ id: channelAccount.id, tipo: channelAccount.tipo })
      .from(channelAccount)
      .where(and(eq(channelAccount.id, channelAccountId), eq(channelAccount.orgId, orgId)));
    if (!conta) throw new Error("Conta de canal nao encontrada para exclusao.");

    // Compradores que compraram por esta conta. `is distinct from` em vez de
    // `<>` porque pedido legado tem channel_account_id nulo — com `<>` o
    // NULL faria o NOT EXISTS nunca casar e ninguém seria anonimizado.
    const exclusivos = await tx.execute<{ cliente_id: string }>(sql`
      select distinct p.cliente_id
      from ${pedido} p
      where p.org_id = ${orgId}
        and p.channel_account_id = ${channelAccountId}
        and not exists (
          select 1 from ${pedido} outro
          where outro.cliente_id = p.cliente_id
            and outro.org_id = ${orgId}
            and outro.channel_account_id is distinct from ${channelAccountId}
        )
    `);
    const compartilhados = await tx.execute<{ cliente_id: string }>(sql`
      select distinct p.cliente_id
      from ${pedido} p
      where p.org_id = ${orgId}
        and p.channel_account_id = ${channelAccountId}
        and exists (
          select 1 from ${pedido} outro
          where outro.cliente_id = p.cliente_id
            and outro.org_id = ${orgId}
            and outro.channel_account_id is distinct from ${channelAccountId}
        )
    `);

    const idsExclusivos = exclusivos.map((r) => r.cliente_id);
    const idsCompartilhados = compartilhados.map((r) => r.cliente_id);

    if (idsExclusivos.length > 0) {
      await tx.update(cliente)
        .set(camposAnonimizadosCliente("Cliente anonimizado", agora))
        .where(and(eq(cliente.orgId, orgId), inArray(cliente.id, idsExclusivos)));

      await tx.update(consentimento)
        .set({ status: "revogado", revokedAt: agora })
        .where(and(eq(consentimento.orgId, orgId), inArray(consentimento.clienteId, idsExclusivos)));

      await tx.update(interacao)
        .set({
          resumo: "Interacao anonimizada por encerramento do canal.",
          meta: { anonymizedAt: agora.toISOString(), channelAccountId },
        })
        .where(and(eq(interacao.orgId, orgId), inArray(interacao.clienteId, idsExclusivos)));
    }

    // A identidade guarda o id do comprador NA PLATAFORMA — é o dado que a
    // plataforma mais claramente considera dela. Sai para os dois grupos,
    // inclusive para quem foi preservado por comprar em outro canal.
    const canal = CANAL_DA_CONTA[conta.tipo];
    const todos = [...idsExclusivos, ...idsCompartilhados];
    let identidadesRemovidas = 0;
    if (canal && todos.length > 0) {
      const removidas = await tx.delete(clienteIdentidade)
        .where(and(
          eq(clienteIdentidade.orgId, orgId),
          eq(clienteIdentidade.canal, canal),
          inArray(clienteIdentidade.clienteId, todos),
        ))
        .returning({ id: clienteIdentidade.id });
      identidadesRemovidas = removidas.length;
    }

    await tx.update(channelAccount)
      .set({ dadosExcluidosEm: agora, updatedAt: agora })
      .where(and(eq(channelAccount.id, channelAccountId), eq(channelAccount.orgId, orgId)));

    const resultado: ResultadoExclusaoCanal = {
      channelAccountId,
      clientesAnonimizados: idsExclusivos.length,
      clientesPreservados: idsCompartilhados.length,
      identidadesRemovidas,
    };

    // O log é a prova de cumprimento: sem ele não há o que mostrar a uma
    // plataforma que pergunte se os dados dela foram mesmo apagados.
    await tx.insert(auditLog).values({
      orgId,
      autorTipo: "sistema",
      entidade: "channel_account",
      entidadeId: channelAccountId,
      acao: "dados_excluidos_por_encerramento",
      depois: resultado,
    });

    return resultado;
  });
}
