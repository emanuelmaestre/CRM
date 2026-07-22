import { describe, expect, it } from "vitest";
import { assertPerfil, type Perfil } from "@/shared/lib/crud-factory";
import { isPerfil, perfilPodeAcessar } from "@/shared/lib/auth/authorization";
import { validarAlteracaoDoProprioAdmin } from "@/modules/usuarios/application/usuarios.service";

function contexto(perfil: Perfil) {
  return { perfil };
}

describe("Autorização por perfil", () => {
  it("permite perfil explicitamente autorizado", () => {
    expect(() => assertPerfil(contexto("gestor"), ["admin", "gestor"])).not.toThrow();
  });

  it("bloqueia vendedor em operação gerencial", () => {
    expect(() => assertPerfil(contexto("vendedor"), ["admin", "gestor"]))
      .toThrow("Perfil 'vendedor' não tem permissão");
  });

  it("bloqueia gestor em operação exclusiva de admin", () => {
    expect(() => assertPerfil(contexto("gestor"), ["admin"]))
      .toThrow("Perfil 'gestor' não tem permissão");
  });

  it.each([
    ["admin", "/configuracoes", true],
    ["gestor", "/configuracoes", false],
    ["vendedor", "/configuracoes", false],
    ["admin", "/relatorios", true],
    ["gestor", "/relatorios", true],
    ["vendedor", "/relatorios", false],
    ["gestor", "/importacao", true],
    ["vendedor", "/importacao", false],
    ["gestor", "/estoque/novo", true],
    ["vendedor", "/estoque/novo", false],
    ["vendedor", "/clientes", true],
  ] as const)("aplica %s em %s", (perfil, pathname, permitido) => {
    expect(perfilPodeAcessar(perfil, pathname)).toBe(permitido);
  });

  it("reconhece apenas os três perfis oficiais", () => {
    expect(isPerfil("admin")).toBe(true);
    expect(isPerfil("gestor")).toBe(true);
    expect(isPerfil("vendedor")).toBe(true);
    expect(isPerfil("superadmin")).toBe(false);
  });

  it("impede o administrador de remover o próprio acesso", () => {
    expect(() => validarAlteracaoDoProprioAdmin("user-1", {
      userId: "user-1",
      perfil: "gestor",
      ativo: true,
    })).toThrow("não pode remover o próprio acesso");

    expect(() => validarAlteracaoDoProprioAdmin("user-1", {
      userId: "user-1",
      perfil: "admin",
      ativo: false,
    })).toThrow("não pode remover o próprio acesso");
  });
});
