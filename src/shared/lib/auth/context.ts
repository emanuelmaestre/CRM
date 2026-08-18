import type { Perfil } from "./authorization";
import { normalizarModulos, type ModuloId } from "@/config/modulos";

export type AuthAccessCode = "UNAUTHENTICATED" | "NOT_PROVISIONED" | "INACTIVE";

export class AuthAccessError extends Error {
  constructor(
    public readonly code: AuthAccessCode,
    public readonly status: 401 | 403,
  ) {
    super(code);
    this.name = "AuthAccessError";
  }
}

export interface AuthIdentity {
  id: string;
  email?: string | null;
  userMetadata?: Record<string, unknown>;
}

export interface AppUserIdentity {
  id: string;
  orgId: string;
  email: string;
  nome: string;
  perfil: Perfil;
  cargo: string | null;
  modulosVisiveis: unknown;
  ativo: boolean;
}

export interface AuthContext {
  userId: string;
  orgId: string;
  email: string;
  nome: string;
  perfil: Perfil;
  cargo: string | null;
  modulosVisiveis: ModuloId[];
}

export function buildAuthContext(
  authUser: AuthIdentity | null,
  appUser: AppUserIdentity | null,
  orgId: string,
): AuthContext {
  if (!authUser) throw new AuthAccessError("UNAUTHENTICATED", 401);
  if (!appUser || appUser.id !== authUser.id || appUser.orgId !== orgId) {
    throw new AuthAccessError("NOT_PROVISIONED", 403);
  }
  if (!appUser.ativo) throw new AuthAccessError("INACTIVE", 403);

  return {
    userId: authUser.id,
    orgId,
    email: appUser.email,
    nome: appUser.nome,
    perfil: appUser.perfil,
    cargo: appUser.cargo,
    modulosVisiveis: normalizarModulos(appUser.modulosVisiveis),
  };
}
