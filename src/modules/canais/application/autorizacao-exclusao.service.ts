import { createClient } from "@supabase/supabase-js";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { assertPerfil, type CrudContext } from "@/shared/lib/crud-factory";
import { db } from "@/shared/lib/db";
import {
  appUser,
  auditLog,
  channelAccount,
  exclusaoCanalAutorizacao,
} from "@/shared/lib/db/schema";
import { excluirDadosDaConta } from "./encerramento-canal.service";

/** Quantos admins distintos precisam assinar para a exclusão destrancar.
 *
 *  Três, e não um, porque a exclusão é irreversível e atinge o histórico de
 *  compradores de um canal inteiro. Uma senha só transforma uma conta de
 *  admin comprometida — ou um clique errado — em perda definitiva. */
export const ASSINATURAS_NECESSARIAS = 3;

const AutorizarSchema = z.object({
  channelAccountId: z.string().uuid(),
  senha: z.string().min(1, "Informe a senha."),
  confirmacao: z.literal("EXCLUIR DADOS"),
});

/** Confere a senha do próprio usuário logado sem tocar na sessão dele.
 *
 *  O cliente aqui é avulso e sem persistência de sessão de propósito: um
 *  `signInWithPassword` no cliente normal (o de cookies) reescreveria os
 *  cookies da sessão em curso. Este valida a credencial, devolve um token
 *  que é jogado fora e não deixa rastro no navegador. */
async function senhaConfere(email: string, senha: string): Promise<boolean> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) return false;
  await supabase.auth.signOut();
  return true;
}

export type EstadoAutorizacao = {
  channelAccountId: string;
  encerradoEm: Date | null;
  dadosExcluidosEm: Date | null;
  assinaturas: { email: string; em: Date }[];
  faltam: number;
  liberado: boolean;
};

export async function estadoAutorizacaoExclusao(
  ctx: CrudContext,
  channelAccountId: string,
): Promise<EstadoAutorizacao> {
  assertPerfil(ctx, ["admin"]);

  const [conta] = await ctx.db
    .select({
      id: channelAccount.id,
      encerradoEm: channelAccount.encerradoEm,
      dadosExcluidosEm: channelAccount.dadosExcluidosEm,
    })
    .from(channelAccount)
    .where(and(eq(channelAccount.id, channelAccountId), eq(channelAccount.orgId, ctx.orgId)));
  if (!conta) throw new Error("Conta de canal nao encontrada.");

  const assinaturas = await ctx.db
    .select({
      email: exclusaoCanalAutorizacao.autorizadoPorEmail,
      em: exclusaoCanalAutorizacao.autorizadoEm,
    })
    .from(exclusaoCanalAutorizacao)
    .where(and(
      eq(exclusaoCanalAutorizacao.channelAccountId, channelAccountId),
      eq(exclusaoCanalAutorizacao.orgId, ctx.orgId),
    ));

  return {
    channelAccountId,
    encerradoEm: conta.encerradoEm,
    dadosExcluidosEm: conta.dadosExcluidosEm,
    assinaturas,
    faltam: Math.max(0, ASSINATURAS_NECESSARIAS - assinaturas.length),
    liberado: assinaturas.length >= ASSINATURAS_NECESSARIAS && !conta.dadosExcluidosEm,
  };
}

/** Registra a assinatura de UM admin. Não executa nada — juntar as três é
 *  que destranca, e mesmo assim a execução é um segundo passo explícito. */
export async function autorizarExclusaoCanal(ctx: CrudContext, input: unknown) {
  assertPerfil(ctx, ["admin"]);
  const data = AutorizarSchema.parse(input);
  if (!ctx.userId) throw new Error("Sessao sem usuario identificado.");

  const [usuario] = await ctx.db
    .select({ email: appUser.email, perfil: appUser.perfil, ativo: appUser.ativo })
    .from(appUser)
    .where(and(eq(appUser.id, ctx.userId), eq(appUser.orgId, ctx.orgId)));
  if (!usuario || !usuario.ativo || usuario.perfil !== "admin") {
    throw new Error("Somente um admin ativo pode autorizar a exclusao.");
  }

  const [conta] = await ctx.db
    .select({ id: channelAccount.id, encerradoEm: channelAccount.encerradoEm })
    .from(channelAccount)
    .where(and(eq(channelAccount.id, data.channelAccountId), eq(channelAccount.orgId, ctx.orgId)));
  if (!conta) throw new Error("Conta de canal nao encontrada.");
  // Sem encerramento declarado não há o que autorizar: assinar antes disso
  // deixaria autorização pronta esperando, que é o oposto do controle.
  if (!conta.encerradoEm) throw new Error("A relacao com este canal ainda nao foi encerrada.");

  if (!(await senhaConfere(usuario.email, data.senha))) {
    // A tentativa fica registrada mesmo quando a senha erra — três erros
    // seguidos numa conta de admin é sinal que alguém precisa ver.
    await ctx.db.insert(auditLog).values({
      orgId: ctx.orgId,
      autorId: ctx.userId,
      autorTipo: "usuario",
      entidade: "channel_account",
      entidadeId: data.channelAccountId,
      acao: "autorizacao_exclusao_senha_invalida",
    });
    throw new Error("Senha incorreta.");
  }

  await ctx.db.insert(exclusaoCanalAutorizacao).values({
    orgId: ctx.orgId,
    channelAccountId: data.channelAccountId,
    autorizadoPorId: ctx.userId,
    autorizadoPorEmail: usuario.email,
  }).onConflictDoNothing({
    target: [exclusaoCanalAutorizacao.channelAccountId, exclusaoCanalAutorizacao.autorizadoPorId],
  });

  await ctx.db.insert(auditLog).values({
    orgId: ctx.orgId,
    autorId: ctx.userId,
    autorTipo: "usuario",
    entidade: "channel_account",
    entidadeId: data.channelAccountId,
    acao: "autorizacao_exclusao_assinada",
    depois: { email: usuario.email },
  });

  return estadoAutorizacaoExclusao(ctx, data.channelAccountId);
}

/** Executa, e só depois das três assinaturas. Passo separado de propósito:
 *  a terceira assinatura não dispara a exclusão sozinha, alguém ainda precisa
 *  mandar executar sabendo que as três já estão lá. */
export async function executarExclusaoCanal(ctx: CrudContext, channelAccountId: string) {
  assertPerfil(ctx, ["admin"]);
  const estado = await estadoAutorizacaoExclusao(ctx, channelAccountId);

  if (estado.dadosExcluidosEm) throw new Error("Os dados deste canal ja foram excluidos.");
  if (!estado.encerradoEm) throw new Error("A relacao com este canal ainda nao foi encerrada.");
  if (estado.faltam > 0) {
    throw new Error(
      `Faltam ${estado.faltam} de ${ASSINATURAS_NECESSARIAS} autorizacoes de admins distintos.`,
    );
  }

  return excluirDadosDaConta(ctx.orgId, channelAccountId);
}

/** Reconectar o canal apaga as assinaturas. Autorização é para AQUELE
 *  encerramento; deixá-la de pé faria um encerramento futuro nascer com três
 *  assinaturas que ninguém daquele momento deu. */
export async function limparAutorizacoesExclusao(orgId: string, channelAccountId: string) {
  await db.delete(exclusaoCanalAutorizacao).where(and(
    eq(exclusaoCanalAutorizacao.orgId, orgId),
    eq(exclusaoCanalAutorizacao.channelAccountId, channelAccountId),
  ));
}
