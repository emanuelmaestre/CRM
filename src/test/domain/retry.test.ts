import { describe, expect, it, vi } from "vitest";
import { executarComRetry } from "@/modules/canais/application/retry";

describe("Retentativas dos conectores da Fase B", () => {
  it("repete falhas transitórias e retorna quando a terceira tentativa funciona", async () => {
    const operacao = vi.fn(async (tentativa: number) => {
      if (tentativa < 3) throw new Error("falha transitória");
      return "ok";
    });
    const esperar = vi.fn(async () => undefined);

    await expect(executarComRetry(operacao, { tentativas: 3, atrasoInicialMs: 25, esperar })).resolves.toBe("ok");
    expect(operacao).toHaveBeenCalledTimes(3);
    expect(esperar).toHaveBeenNthCalledWith(1, 25);
    expect(esperar).toHaveBeenNthCalledWith(2, 50);
  });

  it("propaga o último erro depois de esgotar as tentativas", async () => {
    const operacao = vi.fn(async () => { throw new Error("provider indisponível"); });
    await expect(executarComRetry(operacao, { tentativas: 2, esperar: async () => undefined })).rejects.toThrow("provider indisponível");
    expect(operacao).toHaveBeenCalledTimes(2);
  });
});
