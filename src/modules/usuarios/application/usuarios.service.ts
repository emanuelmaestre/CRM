import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { assertPerfil, type CrudContext } from "@/shared/lib/crud-factory";
import { appUser, auditLog } from "@/shared/lib/db/schema";

export const AtualizarUsuarioSchema = z.object({
  userId: z.string().uuid(),
  perfil: z.enum(["admin", "gestor", "vendedor"]),
  ativo: z.boolean(),
});

export type AtualizarUsuarioInput = z.infer<typeof AtualizarUsuarioSchema>;

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

  return atualizado;
}
