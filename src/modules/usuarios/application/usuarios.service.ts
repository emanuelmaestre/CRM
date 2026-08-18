import { createClient } from "@supabase/supabase-js";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { assertPerfil, type CrudContext } from "@/shared/lib/crud-factory";
import { appUser, auditLog } from "@/shared/lib/db/schema";
import { persistirEvento } from "@/shared/events";

const PerfilSchema = z.enum(["admin", "gestor", "vendedor"]);
const SenhaTemporariaSchema = z.string()
  .min(8, "A senha precisa ter pelo menos 8 caracteres.")
  .max(128, "A senha deve ter no máximo 128 caracteres.")
  .regex(/[A-Za-zÀ-ÿ]/, "Inclua pelo menos uma letra.")
  .regex(/\d/, "Inclua pelo menos um número.");

export const AtualizarUsuarioSchema = z.object({
  userId: z.string().uuid(),
  perfil: PerfilSchema,
  ativo: z.boolean(),
});

export const CriarUsuarioSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome do usuário.").max(120),
  email: z.string().trim().email("Informe um e-mail válido.").transform((email) => email.toLowerCase()),
  perfil: PerfilSchema,
  senha: SenhaTemporariaSchema,
});

export const RedefinirSenhaUsuarioSchema = z.object({
  userId: z.string().uuid(),
  senha: SenhaTemporariaSchema,
});

export const ExcluirUsuarioSchema = z.object({
  userId: z.string().uuid(),
});

export type AtualizarUsuarioInput = z.infer<typeof AtualizarUsuarioSchema>;
export type CriarUsuarioInput = z.infer<typeof CriarUsuarioSchema>;
export type RedefinirSenhaUsuarioInput = z.infer<typeof RedefinirSenhaUsuarioSchema>;
export type ExcluirUsuarioInput = z.infer<typeof ExcluirUsuarioSchema>;

function criarSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase Admin não configurado. Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

type SupabaseAdminClient = ReturnType<typeof criarSupabaseAdminClient>;

async function buscarUsuarioAuthPorEmail(adminClient: SupabaseAdminClient, email: string) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;

    const encontrado = data.users.find((user) => user.email?.toLowerCase() === email);
    if (encontrado) return encontrado;
    if (data.users.length < 1000) break;
  }

  return null;
}

function mensagemErroSupabase(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? `${fallback} (${error.message})` : fallback;
}

export function validarAlteracaoDoProprioAdmin(
  actorId: string | undefined,
  input: AtualizarUsuarioInput,
) {
  if (actorId === input.userId && (input.perfil !== "admin" || !input.ativo)) {
    throw new Error("O administrador não pode remover o próprio acesso.");
  }
}

export async function listarUsuarios(ctx: CrudContext) {
  assertPerfil(ctx, ["admin"]);
  return ctx.db
    .select({
      id: appUser.id,
      email: appUser.email,
      nome: appUser.nome,
      perfil: appUser.perfil,
      ativo: appUser.ativo,
    })
    .from(appUser)
    .where(eq(appUser.orgId, ctx.orgId))
    .orderBy(asc(appUser.nome));
}

export async function criarUsuarioComSenha(ctx: CrudContext, rawInput: unknown) {
  assertPerfil(ctx, ["admin"]);
  const input = CriarUsuarioSchema.parse(rawInput);

  const usuarioExistente = await ctx.db
    .select({ id: appUser.id })
    .from(appUser)
    .where(eq(appUser.email, input.email))
    .then((rows) => rows[0]);

  if (usuarioExistente) {
    throw new Error("Já existe um usuário com este e-mail.");
  }

  const adminClient = criarSupabaseAdminClient();
  const usuarioAuthExistente = await buscarUsuarioAuthPorEmail(adminClient, input.email);
  let authUserId = usuarioAuthExistente?.id;
  let authCriadoNestaOperacao = false;

  try {
    if (usuarioAuthExistente) {
      const { data, error } = await adminClient.auth.admin.updateUserById(usuarioAuthExistente.id, {
        password: input.senha,
        user_metadata: {
          ...usuarioAuthExistente.user_metadata,
          full_name: input.nome,
          crm_org_id: ctx.orgId,
          perfil: input.perfil,
        },
      });
      if (error) throw error;
      authUserId = data.user?.id ?? usuarioAuthExistente.id;
    } else {
      const { data, error } = await adminClient.auth.admin.createUser({
        email: input.email,
        password: input.senha,
        email_confirm: true,
        user_metadata: {
          full_name: input.nome,
          crm_org_id: ctx.orgId,
          perfil: input.perfil,
        },
      });
      if (error) throw error;
      if (!data.user?.id) throw new Error("Supabase não retornou o usuário criado.");
      authUserId = data.user.id;
      authCriadoNestaOperacao = true;
    }
  } catch (error) {
    throw new Error(mensagemErroSupabase(error, "Não foi possível criar o usuário no Supabase Auth."));
  }

  const usuarioComMesmoAuth = await ctx.db
    .select({ id: appUser.id })
    .from(appUser)
    .where(eq(appUser.id, authUserId))
    .then((rows) => rows[0]);

  if (usuarioComMesmoAuth) {
    if (authCriadoNestaOperacao) {
      await adminClient.auth.admin.deleteUser(authUserId).catch(() => undefined);
    }
    throw new Error("Este acesso já está provisionado no CRM.");
  }

  try {
    const [criado] = await ctx.db
      .insert(appUser)
      .values({
        id: authUserId,
        orgId: ctx.orgId,
        email: input.email,
        nome: input.nome,
        perfil: input.perfil,
        ativo: true,
      })
      .returning({
        id: appUser.id,
        email: appUser.email,
        nome: appUser.nome,
        perfil: appUser.perfil,
        ativo: appUser.ativo,
      });

    await ctx.db.insert(auditLog).values({
      orgId: ctx.orgId,
      autorId: ctx.userId,
      autorTipo: "usuario",
      entidade: "app_user",
      entidadeId: criado.id,
      acao: "usuario_criado",
      depois: {
        email: criado.email,
        nome: criado.nome,
        perfil: criado.perfil,
        ativo: criado.ativo,
        origemAuth: usuarioAuthExistente ? "auth_existente" : "auth_criado",
      },
    });

    await persistirEvento({
      tipo: "usuario.criado",
      orgId: ctx.orgId,
      entidade: "app_user",
      entidadeId: criado.id,
      payload: {
        email: criado.email,
        nome: criado.nome,
        perfil: criado.perfil,
        ativo: criado.ativo,
        authExistente: Boolean(usuarioAuthExistente),
      },
    }, ctx.db);

    return criado;
  } catch (error) {
    if (authCriadoNestaOperacao) {
      await adminClient.auth.admin.deleteUser(authUserId).catch(() => undefined);
    }
    throw error;
  }
}

export async function atualizarUsuario(ctx: CrudContext, rawInput: unknown) {
  assertPerfil(ctx, ["admin"]);
  const input = AtualizarUsuarioSchema.parse(rawInput);
  validarAlteracaoDoProprioAdmin(ctx.userId, input);

  const atual = await ctx.db
    .select()
    .from(appUser)
    .where(and(eq(appUser.id, input.userId), eq(appUser.orgId, ctx.orgId)))
    .then((rows) => rows[0]);

  if (!atual) throw new Error("Usuário não encontrado.");

  if (atual.perfil === "admin" && atual.ativo && (input.perfil !== "admin" || !input.ativo)) {
    const adminsAtivos = await ctx.db
      .select({ id: appUser.id })
      .from(appUser)
      .where(and(
        eq(appUser.orgId, ctx.orgId),
        eq(appUser.perfil, "admin"),
        eq(appUser.ativo, true),
      ));
    if (adminsAtivos.length <= 1) {
      throw new Error("A organização precisa manter ao menos um administrador ativo.");
    }
  }

  const [atualizado] = await ctx.db
    .update(appUser)
    .set({ perfil: input.perfil, ativo: input.ativo, updatedAt: new Date() })
    .where(and(eq(appUser.id, input.userId), eq(appUser.orgId, ctx.orgId)))
    .returning({
      id: appUser.id,
      email: appUser.email,
      nome: appUser.nome,
      perfil: appUser.perfil,
      ativo: appUser.ativo,
    });

  await ctx.db.insert(auditLog).values({
    orgId: ctx.orgId,
    autorId: ctx.userId,
    autorTipo: "usuario",
    entidade: "app_user",
    entidadeId: input.userId,
    acao: "perfil_atualizado",
    antes: { perfil: atual.perfil, ativo: atual.ativo },
    depois: { perfil: atualizado.perfil, ativo: atualizado.ativo },
  });

  await persistirEvento({
    tipo: "usuario.perfil_atualizado",
    orgId: ctx.orgId,
    entidade: "app_user",
    entidadeId: input.userId,
    payload: {
      perfilAnterior: atual.perfil,
      perfilAtual: atualizado.perfil,
      ativoAnterior: atual.ativo,
      ativoAtual: atualizado.ativo,
    },
  }, ctx.db);

  return atualizado;
}

function ehViolacaoDeChaveEstrangeira(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  return (error as { code?: string }).code === "23503";
}

/** Exclui de verdade quando dá — e quando não dá, diz por quê em vez de só
 *  desativar em silêncio.
 *
 *  `app_user.id` é referenciado por anotação de cliente, resolução de LGPD,
 *  responsável por conversa/pedido e solicitação de régua (sem cascade,
 *  de propósito: perder quem resolveu uma reclamação ou autorizou um envio
 *  seria pior que manter o rótulo). Um usuário com qualquer histórico não
 *  sai limpo — o DELETE esbarra em 23503 (violação de chave estrangeira) e
 *  o fallback anonimiza em vez de travar a ação: e-mail e nome viram
 *  rótulos genéricos, o login é removido do Supabase Auth, e a linha
 *  continua existindo só para as referências antigas não ficarem órfãs. */
export async function excluirUsuario(ctx: CrudContext, rawInput: unknown) {
  assertPerfil(ctx, ["admin"]);
  const input = ExcluirUsuarioSchema.parse(rawInput);

  if (ctx.userId === input.userId) {
    throw new Error("Você não pode excluir o próprio acesso.");
  }

  const atual = await ctx.db
    .select()
    .from(appUser)
    .where(and(eq(appUser.id, input.userId), eq(appUser.orgId, ctx.orgId)))
    .then((rows) => rows[0]);

  if (!atual) throw new Error("Usuário não encontrado.");

  if (atual.perfil === "admin" && atual.ativo) {
    const adminsAtivos = await ctx.db
      .select({ id: appUser.id })
      .from(appUser)
      .where(and(
        eq(appUser.orgId, ctx.orgId),
        eq(appUser.perfil, "admin"),
        eq(appUser.ativo, true),
      ));
    if (adminsAtivos.length <= 1) {
      throw new Error("A organização precisa manter ao menos um administrador ativo.");
    }
  }

  const adminClient = criarSupabaseAdminClient();
  await adminClient.auth.admin.deleteUser(atual.id).catch(() => undefined);

  let excluidoDeVerdade = true;
  try {
    await ctx.db.delete(appUser).where(and(eq(appUser.id, input.userId), eq(appUser.orgId, ctx.orgId)));
  } catch (error) {
    if (!ehViolacaoDeChaveEstrangeira(error)) throw error;
    excluidoDeVerdade = false;
    await ctx.db
      .update(appUser)
      .set({
        email: `removed-${atual.id}@example.invalid`,
        nome: "Usuário removido",
        ativo: false,
        updatedAt: new Date(),
      })
      .where(and(eq(appUser.id, input.userId), eq(appUser.orgId, ctx.orgId)));
  }

  await ctx.db.insert(auditLog).values({
    orgId: ctx.orgId,
    autorId: ctx.userId,
    autorTipo: "usuario",
    entidade: "app_user",
    entidadeId: input.userId,
    acao: excluidoDeVerdade ? "usuario_excluido" : "usuario_anonimizado",
    antes: { email: atual.email, nome: atual.nome, perfil: atual.perfil, ativo: atual.ativo },
  });

  return { excluidoDeVerdade };
}

export async function redefinirSenhaUsuario(ctx: CrudContext, rawInput: unknown) {
  assertPerfil(ctx, ["admin"]);
  const input = RedefinirSenhaUsuarioSchema.parse(rawInput);

  const usuario = await ctx.db
    .select({
      id: appUser.id,
      email: appUser.email,
      nome: appUser.nome,
      perfil: appUser.perfil,
      ativo: appUser.ativo,
    })
    .from(appUser)
    .where(and(eq(appUser.id, input.userId), eq(appUser.orgId, ctx.orgId)))
    .then((rows) => rows[0]);

  if (!usuario) throw new Error("Usuário não encontrado.");

  const adminClient = criarSupabaseAdminClient();
  const { error } = await adminClient.auth.admin.updateUserById(usuario.id, {
    password: input.senha,
  });

  if (error) {
    throw new Error(mensagemErroSupabase(error, "Não foi possível redefinir a senha no Supabase Auth."));
  }

  await ctx.db.insert(auditLog).values({
    orgId: ctx.orgId,
    autorId: ctx.userId,
    autorTipo: "usuario",
    entidade: "app_user",
    entidadeId: usuario.id,
    acao: "senha_redefinida",
    depois: {
      email: usuario.email,
      nome: usuario.nome,
      perfil: usuario.perfil,
      ativo: usuario.ativo,
    },
  });

  await persistirEvento({
    tipo: "usuario.senha_redefinida",
    orgId: ctx.orgId,
    entidade: "app_user",
    entidadeId: usuario.id,
    payload: {
      email: usuario.email,
      perfil: usuario.perfil,
      ativo: usuario.ativo,
    },
  }, ctx.db);

  return usuario;
}
