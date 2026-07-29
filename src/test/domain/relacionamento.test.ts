import { describe, expect, it } from "vitest";
import { CriarAnotacaoSchema } from "@/modules/clientes/domain/entities";
import { CriarSegmentoSchema } from "@/modules/clientes/domain/segmentos";
import { FiltrosLembretesSchema } from "@/modules/vendas/domain/operacao";

const uuid = "123e4567-e89b-42d3-a456-426614174000";

describe("anotações de cliente", () => {
  it("aceita anotação com texto válido", () => {
    const result = CriarAnotacaoSchema.parse({ clienteId: uuid, texto: "  Cliente prefere contato por WhatsApp  " });
    expect(result.texto).toBe("Cliente prefere contato por WhatsApp");
  });

  it("rejeita anotação vazia", () => {
    expect(() => CriarAnotacaoSchema.parse({ clienteId: uuid, texto: "   " })).toThrow();
  });

  it("rejeita clienteId inválido", () => {
    expect(() => CriarAnotacaoSchema.parse({ clienteId: "não-uuid", texto: "ok" })).toThrow();
  });
});

describe("segmentação de clientes", () => {
  it("aceita segmento com nome e ao menos uma tag", () => {
    const result = CriarSegmentoSchema.parse({ nome: "VIP", filtros: { tagIds: [uuid] } });
    expect(result.filtros.tagIds).toEqual([uuid]);
  });

  it("rejeita segmento sem tags", () => {
    expect(() => CriarSegmentoSchema.parse({ nome: "VIP", filtros: { tagIds: [] } })).toThrow();
  });

  it("rejeita nome curto demais", () => {
    expect(() => CriarSegmentoSchema.parse({ nome: "A", filtros: { tagIds: [uuid] } })).toThrow();
  });
});

describe("lembretes", () => {
  it("usa janela padrão de 72h quando não informada", () => {
    expect(FiltrosLembretesSchema.parse({}).janelaHoras).toBe(72);
  });

  it("aceita janela customizada", () => {
    expect(FiltrosLembretesSchema.parse({ janelaHoras: 24 }).janelaHoras).toBe(24);
  });

  it("rejeita janela fora do intervalo permitido", () => {
    expect(() => FiltrosLembretesSchema.parse({ janelaHoras: 0 })).toThrow();
    expect(() => FiltrosLembretesSchema.parse({ janelaHoras: 24 * 31 })).toThrow();
  });
});
