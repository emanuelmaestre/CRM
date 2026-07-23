import { describe, expect, it } from "vitest";
import { format } from "date-fns";
import { obterHorarioSaoPaulo } from "@/modules/reguas/domain/gates";

describe("Gate 4 — Idempotência de régua", () => {
  function gerarIdempotencyKey(reguaId: string, clienteId: string, gatilho: string, data: Date): string {
    return `${reguaId}:${clienteId}:${gatilho}:${format(data, "yyyy-MM-dd")}`;
  }

  it("gera a mesma chave para a mesma régua, cliente, gatilho e data", () => {
    const data = new Date("2026-07-20T12:00:00Z");
    expect(gerarIdempotencyKey("r1", "c1", "pedido_entregue", data)).toBe(
      gerarIdempotencyKey("r1", "c1", "pedido_entregue", data),
    );
  });

  it("separa datas e clientes diferentes", () => {
    const base = gerarIdempotencyKey("r1", "c1", "aniversario", new Date("2026-07-20T12:00:00Z"));
    expect(base).not.toBe(gerarIdempotencyKey("r1", "c1", "aniversario", new Date("2026-07-21T12:00:00Z")));
    expect(base).not.toBe(gerarIdempotencyKey("r1", "c2", "aniversario", new Date("2026-07-20T12:00:00Z")));
  });
});

describe("Gate 5 — Janela comercial em America/Sao_Paulo", () => {
  function dentroJanelaComercial(data: Date): boolean {
    const { hora, diaSemana } = obterHorarioSaoPaulo(data);
    return diaSemana !== "Sun" && diaSemana !== "Sat" && hora >= 8 && hora < 20;
  }

  it("permite de segunda a sexta entre 08h e 19h59", () => {
    expect(dentroJanelaComercial(new Date("2026-07-20T11:00:00Z"))).toBe(true);
    expect(dentroJanelaComercial(new Date("2026-07-24T22:59:00Z"))).toBe(true);
  });

  it("bloqueia antes das 08h, a partir das 20h e no fim de semana", () => {
    expect(dentroJanelaComercial(new Date("2026-07-20T10:59:00Z"))).toBe(false);
    expect(dentroJanelaComercial(new Date("2026-07-20T23:00:00Z"))).toBe(false);
    expect(dentroJanelaComercial(new Date("2026-07-25T13:00:00Z"))).toBe(false);
    expect(dentroJanelaComercial(new Date("2026-07-26T13:00:00Z"))).toBe(false);
  });
});
