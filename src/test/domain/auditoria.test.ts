import { describe, expect, it } from "vitest";
import { FiltrosAuditoriaSchema } from "@/modules/auditoria/domain/filtros";

describe("filtros de auditoria", () => {
  it("aplica paginação segura por padrão", () => {
    const result = FiltrosAuditoriaSchema.parse({});
    expect(result).toMatchObject({ pagina: 1, limite: 50 });
  });

  it("limita payload e paginação", () => {
    expect(() => FiltrosAuditoriaSchema.parse({ limite: 101 })).toThrow();
    expect(() => FiltrosAuditoriaSchema.parse({ busca: "x".repeat(121) })).toThrow();
  });
});
