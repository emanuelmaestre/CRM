import { describe, it, expect } from "vitest";
import { validarTransicaoConversa, reabrirSeNecessario } from "@/modules/inbox/domain/state-machine";

describe("Máquina de estados — Conversa (Invariante nº 7)", () => {
  it("nova → em_atendimento é válido", () => {
    expect(() => validarTransicaoConversa("nova", "em_atendimento")).not.toThrow();
  });

  it("em_atendimento → resolvida é válido", () => {
    expect(() => validarTransicaoConversa("em_atendimento", "resolvida")).not.toThrow();
  });

  it("resolvida → em_atendimento é válido (reabertura)", () => {
    expect(() => validarTransicaoConversa("resolvida", "em_atendimento")).not.toThrow();
  });

  it("arquivada → qualquer coisa é inválido (estado final)", () => {
    expect(() => validarTransicaoConversa("arquivada", "nova")).toThrow();
    expect(() => validarTransicaoConversa("arquivada", "em_atendimento")).toThrow();
  });

  it("reabrirSeNecessario reativa conversa resolvida", () => {
    expect(reabrirSeNecessario("resolvida")).toBe("em_atendimento");
    expect(reabrirSeNecessario("arquivada")).toBe("em_atendimento");
    expect(reabrirSeNecessario("nova")).toBe("nova");
    expect(reabrirSeNecessario("em_atendimento")).toBe("em_atendimento");
  });
});
