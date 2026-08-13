import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/shared/lib/db";
import { appUser } from "@/shared/lib/db/schema";
import { createClient } from "@/shared/lib/supabase/server";
import { AuthAccessError, buildAuthContext, type AuthContext } from "./context";
import { perfilPermitido, perfilPodeAcessar, type Perfil } from "./authorization";

const OrgIdSchema = z.string().uuid();

/** Memoizado por requisição: o layout do dashboard, cada página e cada server
 *  action chamavam isto de novo, e cada chamada custava uma validação de JWT
 *  mais um SELECT em app_user na mesma conexão. O cache do React é escopado à
 *  requisição, então não vaza sessão entre usuários. */
export const getAuthContext = cache(async function getAuthContext(): Promise<AuthContext> {
  const orgId = OrgIdSchema.parse(process.env.DEFAULT_ORG_ID);
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const userId = claims?.sub;

  const usuarioBd = userId
    ? await db
        .select({
          id: appUser.id,
          orgId: appUser.orgId,
          email: appUser.email,
          nome: appUser.nome,
          perfil: appUser.perfil,
          ativo: appUser.ativo,
        })
        .from(appUser)
        .where(and(eq(appUser.id, userId), eq(appUser.orgId, orgId)))
        .then((rows) => rows[0] ?? null)
    : null;

  return buildAuthContext(
    userId
      ? {
          id: userId,
          email: typeof claims.email === "string" ? claims.email : null,
          userMetadata:
            claims.user_metadata && typeof claims.user_metadata === "object"
              ? claims.user_metadata
              : undefined,
        }
      : null,
    usuarioBd,
    orgId,
  );
});

export async function requirePageAuth(permitidos?: readonly Perfil[]): Promise<AuthContext> {
  let contexto: AuthContext;

  try {
    contexto = await getAuthContext();
  } catch (error) {
    if (error instanceof AuthAccessError) {
      if (error.code === "UNAUTHENTICATED") redirect("/auth/login");
      redirect(`/auth/acesso-negado?motivo=${error.code}`);
    }
    throw error;
  }

  if (permitidos && !perfilPermitido(contexto.perfil, permitidos)) {
    redirect("/sem-permissao");
  }

  return contexto;
}

export async function requirePageRoute(pathname: string): Promise<AuthContext> {
  const contexto = await requirePageAuth();
  if (!perfilPodeAcessar(contexto.perfil, pathname)) redirect("/sem-permissao");
  return contexto;
}

export async function authorizeRoute(permitidos: readonly Perfil[]) {
  try {
    const contexto = await getAuthContext();
    if (!perfilPermitido(contexto.perfil, permitidos)) {
      return {
        ok: false as const,
        response: NextResponse.json({ error: "Sem permissão." }, { status: 403 }),
      };
    }
    return { ok: true as const, contexto };
  } catch (error) {
    if (error instanceof AuthAccessError) {
      return {
        ok: false as const,
        response: NextResponse.json(
          { error: error.code === "UNAUTHENTICATED" ? "Não autenticado." : "Acesso bloqueado." },
          { status: error.status },
        ),
      };
    }
    throw error;
  }
}
