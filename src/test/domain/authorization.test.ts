import { describe, expect, it } from "vitest";
import { assertPerfil, type Perfil } from "@/shared/lib/crud-factory";

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
});
