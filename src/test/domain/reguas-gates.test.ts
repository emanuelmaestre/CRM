import { describe, it, expect } from "vitest";
import { format } from "date-fns";

// Testa a lógica de idempotency_key (Gate 4) sem dependência de banco
describe("Gate 4 — Idempotência de régua (Invariante nº 5)", () => {
  function gerarIdempotencyKey(reguaId: string, clienteId: string, gatilho: string, data: Date): string {
    return `${reguaId}:${clienteId}:${gatilho}:${format(data, "yyyy-MM-dd")}`;
  }

  it("mesma régua, cliente, gatilho e data geram a mesma chave", () => {
    const k1 = gerarIdempotencyKey("r1", "c1", "pedido_entregue", new Date("2026-07-20"));
    const k2 = gerarIdempotencyKey("r1", "c1", "pedido_entregue", new Date("2026-07-20"));
    expect(k1).toBe(k2);
  });

  it("datas diferentes geram chaves diferentes", () => {
    const k1 = gerarIdempotencyKey("r1", "c1", "pedido_entregue", new Date("2026-07-20"));
    const k2 = gerarIdempotencyKey("r1", "c1", "pedido_entregue", new Date("2026-07-21"));
    expect(k1).not.toBe(k2);
  });

  it("clientes diferentes geram chaves diferentes", () => {
    const k1 = gerarIdempotencyKey("r1", "c1", "aniversario", new Date("2026-07-20"));
    const k2 = gerarIdempotencyKey("r1", "c2", "aniversario", new Date("2026-07-20"));
    expect(k1).not.toBe(k2);
  });
});

// Testa o Gate 5 — Janela horária comercial
describe("Gate 5 — Janela de horário comercial", () => {
  function dentroJanelaComercial(data: Date): boolean {
    const hora = data.getHours();
    const dia = data.getDay();
    const fimDeSemana = dia === 0 || dia === 6;
    return !fimDeSemana && hora >= 8 && hora < 20;
  }

  it("08h segunda-feira é permitido", () => {
    const d = new Date("2026-07-20T08:00:00"); // segunda
    expect(dentroJanelaComercial(d)).toBe(true);
  });

  it("19h59 sexta-feira é permitido", () => {
    const d = new Date("2026-07-24T19:59:00"); // sexta
    expect(dentroJanelaComercial(d)).toBe(true);
  });

  it("20h é bloqueado", () => {
    const d = new Date("2026-07-20T20:00:00");
    expect(dentroJanelaComercial(d)).toBe(false);
  });

  it("07h59 é bloqueado", () => {
    const d = new Date("2026-07-20T07:59:00");
    expect(dentroJanelaComercial(d)).toBe(false);
  });

  it("sábado é bloqueado", () => {
    const d = new Date("2026-07-25T10:00:00"); // sábado
    expect(dentroJanelaComercial(d)).toBe(false);
  });

  it("domingo é bloqueado", () => {
    const d = new Date("2026-07-26T10:00:00"); // domingo
    expect(dentroJanelaComercial(d)).toBe(false);
  });
});
