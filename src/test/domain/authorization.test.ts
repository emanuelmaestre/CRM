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
    ["admin", "/metricas", true],
    ["gestor", "/metricas", true],
    ["vendedor", "/metricas", false],
    ["gestor", "/importacao", true],
    ["vendedor", "/importacao", false],
    ["vendedor", "/clientes", true],
    // Vendedor consulta estoque, mas configurar a régua de alertas grava
    // estoque mínimo em lote — é operação gerencial.
    ["vendedor", "/estoque", true],
    ["gestor", "/estoque/alertas", true],
    ["admin", "/estoque/alertas", true],
    ["vendedor", "/estoque/alertas", false],
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
