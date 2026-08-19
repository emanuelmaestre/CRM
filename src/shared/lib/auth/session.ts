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
import { perfilPermitido, perfilPodeAcessar, moduloPodeAcessar, type Perfil } from "./authorization";

const OrgIdSchema = z.string().uuid();

/* O SELECT em app_user compete pela única conexão do pool (ver
   getDatabaseClientOptions em db/index.ts — max: 1 é obrigatório enquanto o
   RLS depender de app.current_org_id na conexão). Uma tela como Métricas
   dispara ~8 server actions independentes ao montar; cada uma é sua própria
   requisição HTTP, então o cache do React abaixo (escopado à requisição) não
   compartilha nada entre elas — eram 8 SELECTs de usuário na fila só para
   entrar na tela, antes de qualquer dado de verdade ser buscado.

   Este cache extra vive na instância (módulo, não requisição) e é por
   userId, com TTL curto: reduz esse SELECT repetido para o normal — uma vez
   a cada poucos segundos de navegação — sem risco de vazar sessão entre
   contas (a chave é o próprio userId) e sem atrasar a reação a
   desativação/troca de perfil por mais que os 15s do TTL. */
const AUTH_CACHE_TTL_MS = 15_000;
const authContextCache = new Map<string, { contexto: AuthContext; expiraEm: number }>();

async function carregarAuthContext(): Promise<AuthContext> {
  const orgId = OrgIdSchema.parse(process.env.DEFAULT_ORG_ID);
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const userId = claims?.sub;

  if (!userId) {
    return buildAuthContext(null, null, orgId);
  }

  const agora = Date.now();
  const emCache = authContextCache.get(userId);
  if (emCache && emCache.expiraEm > agora) {
    return emCache.contexto;
  }

  const usuarioBd = await db
    .select({
      id: appUser.id,
      orgId: appUser.orgId,
      email: appUser.email,
      nome: appUser.nome,
      perfil: appUser.perfil,
      cargo: appUser.cargo,
      modulosVisiveis: appUser.modulosVisiveis,
      ativo: appUser.ativo,
    })
    .from(appUser)
    .where(and(eq(appUser.id, userId), eq(appUser.orgId, orgId)))
    .then((rows) => rows[0] ?? null);

  const contexto = buildAuthContext(
    {
      id: userId,
      email: typeof claims.email === "string" ? claims.email : null,
      userMetadata:
        claims.user_metadata && typeof claims.user_metadata === "object"
          ? claims.user_metadata
          : undefined,
    },
    usuarioBd,
    orgId,
  );

  authContextCache.set(userId, { contexto, expiraEm: agora + AUTH_CACHE_TTL_MS });
  return contexto;
}

/** Memoizado por requisição além do cache por instância acima: dentro de uma
 *  mesma requisição (layout + página, por exemplo) ainda evita repetir até a
 *  validação do JWT. */
export const getAuthContext = cache(carregarAuthContext);

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
  if (!moduloPodeAcessar(contexto.modulosVisiveis, pathname)) redirect("/sem-permissao");
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
