import { describe, expect, it } from "vitest";
import { AuthAccessError, buildAuthContext } from "@/shared/lib/auth/context";

const orgId = "123e4567-e89b-42d3-a456-426614174000";
const authUser = { id: "223e4567-e89b-42d3-a456-426614174000", email: "user@example.com" };
const appUser = {
  id: authUser.id,
  orgId,
  email: "user@example.com",
  nome: "Usuário Teste",
  perfil: "gestor" as const,
  ativo: true,
};

describe("Contexto autenticado", () => {
  function capturarErro(executar: () => unknown) {
    try {
      executar();
      throw new Error("Era esperado um AuthAccessError.");
    } catch (error) {
      expect(error).toBeInstanceOf(AuthAccessError);
      return error as AuthAccessError;
    }
  }

  it("combina sessão válida com o perfil provisionado", () => {
    expect(buildAuthContext(authUser, appUser, orgId)).toEqual({
      userId: authUser.id,
      orgId,
      email: appUser.email,
      nome: appUser.nome,
      perfil: "gestor",
    });
  });

  it("rejeita visitante sem sessão", () => {
    const error = capturarErro(() => buildAuthContext(null, null, orgId));
    expect({ code: error.code, status: error.status }).toEqual({ code: "UNAUTHENTICATED", status: 401 });
  });

  it("rejeita usuário sem vínculo com a organização", () => {
    const error = capturarErro(() => buildAuthContext(authUser, null, orgId));
    expect({ code: error.code, status: error.status }).toEqual({ code: "NOT_PROVISIONED", status: 403 });
  });

  it("rejeita usuário desativado", () => {
    const error = capturarErro(() => buildAuthContext(authUser, { ...appUser, ativo: false }, orgId));
    expect({ code: error.code, status: error.status }).toEqual({ code: "INACTIVE", status: 403 });
  });
});
