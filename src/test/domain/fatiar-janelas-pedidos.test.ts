import { describe, expect, it } from "vitest";
import { fatiarJanelasPedidos } from "@/modules/canais/domain/fatiar-janelas-pedidos";

describe("fatiar janelas de pedidos", () => {
  it("divide o período sem criar a janela residual de um milissegundo", () => {
    const dia = 24 * 60 * 60_000;
    expect(fatiarJanelasPedidos([{ inicioMs: 0, fimMs: 3 * dia }], dia)).toEqual([
      { inicioMs: 0, fimMs: dia },
      { inicioMs: dia, fimMs: 2 * dia },
      { inicioMs: 2 * dia, fimMs: 3 * dia },
    ]);
  });

  it("elimina a sobreposição entre janelas do provider", () => {
    expect(fatiarJanelasPedidos([
      { inicioMs: 0, fimMs: 10 },
      { inicioMs: 10, fimMs: 20 },
      { inicioMs: 15, fimMs: 25 },
    ], 10)).toEqual([
      { inicioMs: 0, fimMs: 10 },
      { inicioMs: 10, fimMs: 20 },
      { inicioMs: 20, fimMs: 25 },
    ]);
  });

  it("recusa duração inválida em vez de entrar em laço", () => {
    expect(() => fatiarJanelasPedidos([], 0)).toThrow(/positiva/);
  });
});
