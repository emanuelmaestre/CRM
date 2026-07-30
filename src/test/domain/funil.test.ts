import { describe, expect, it } from "vitest";
import { CriarOportunidadeSchema, MoverOportunidadeSchema } from "@/modules/vendas/domain/funil";

const uuid = {
  brand: "10000000-0000-4000-8000-000000000001",
  stage: "60000000-0000-4000-8000-000000000001",
  opportunity: "63000000-0000-4000-8000-000000000001",
};

describe("Funil de vendas", () => {
  it("normaliza valor com vírgula", () => {
    const result = CriarOportunidadeSchema.parse({
      titulo: "Oportunidade teste", brandId: uuid.brand, etapaId: uuid.stage, valor: "199,90",
    });
    expect(result.valor).toBe("199.90");
  });

  it("rejeita referências malformadas", () => {
    expect(() => CriarOportunidadeSchema.parse({
      titulo: "Teste", brandId: "outra-org", etapaId: uuid.stage,
    })).toThrow();
    expect(() => MoverOportunidadeSchema.parse({
      oportunidadeId: uuid.opportunity, novaEtapaId: "etapa-invalida",
    })).toThrow();
  });

  it("aceita mover sem motivo de perda (obrigatoriedade por etapa é checada no service)", () => {
    const result = MoverOportunidadeSchema.parse({
      oportunidadeId: uuid.opportunity, novaEtapaId: uuid.stage,
    });
    expect(result.motivoPerda).toBeUndefined();
  });

  it("rejeita motivo de perda curto demais quando informado", () => {
    expect(() => MoverOportunidadeSchema.parse({
      oportunidadeId: uuid.opportunity, novaEtapaId: uuid.stage, motivoPerda: "ok",
    })).toThrow();
  });

  it("aceita motivo de perda válido", () => {
    const result = MoverOportunidadeSchema.parse({
      oportunidadeId: uuid.opportunity, novaEtapaId: uuid.stage, motivoPerda: "Preço acima do concorrente",
    });
    expect(result.motivoPerda).toBe("Preço acima do concorrente");
  });
});
