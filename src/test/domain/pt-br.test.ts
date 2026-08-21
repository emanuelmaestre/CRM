import { describe, expect, it } from "vitest";
import { traduzirNivelQualidade, traduzirPendenciaPublicacao } from "@/shared/lib/pt-br";

describe("normalização de textos externos para português do Brasil", () => {
  it.each([
    ["Profesional", "Profissional"],
    ["Professional", "Profissional"],
    ["Avanzado", "Avançado"],
    ["Good", "Bom"],
  ])("traduz o nível de qualidade %s", (origem, esperado) => {
    expect(traduzirNivelQualidade(origem)).toBe(esperado);
  });

  it("não exibe um nível externo desconhecido", () => {
    expect(traduzirNivelQualidade("future_level")).toBe("Nível informado pelo Mercado Livre");
  });

  it("mantém instruções que já estão em português", () => {
    const mensagem = "Ofereça frete grátis para deixar seu anúncio mais competitivo.";
    expect(traduzirPendenciaPublicacao(mensagem)).toBe(mensagem);
  });

  it("substitui mensagens externas ainda não traduzidas", () => {
    expect(traduzirPendenciaPublicacao("Mejora la calidad de tu publicación"))
      .toContain("O Mercado Livre identificou uma melhoria pendente");
    expect(traduzirPendenciaPublicacao("Improve the quality of your listing"))
      .toContain("O Mercado Livre identificou uma melhoria pendente");
  });
});
