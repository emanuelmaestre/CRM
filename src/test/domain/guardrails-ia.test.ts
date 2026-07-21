import { describe, it, expect } from "vitest";
import { calcularCusto, SugestaoCampanhaOutputSchema, InsightOutputSchema } from "@/modules/ai/domain/guardrails";

describe("Guardrails da IA (§11)", () => {
  describe("Cálculo de custo", () => {
    it("calcula custo correto para gpt-4.1-mini", () => {
      const custo = calcularCusto("gpt-4.1-mini", 1000, 500);
      expect(custo).toBeCloseTo(0.00015 + 0.0003, 6);
    });

    it("calcula custo correto para gpt-4.1", () => {
      const custo = calcularCusto("gpt-4.1", 1000, 500);
      expect(custo).toBeCloseTo(0.002 + 0.004, 6);
    });
  });

  describe("Validação de saída — SugestaoCampanha (Zod gate)", () => {
    it("aceita saída válida", () => {
      const r = SugestaoCampanhaOutputSchema.safeParse({
        titulo: "Reativação de clientes inativos",
        segmentoDescricao: "Clientes sem compra há mais de 90 dias com histórico de 3+ compras",
        oferta: "Frete grátis + 10% de desconto na próxima compra",
        descontoMinimo: 10,
        justificativa: "Clientes com alta frequência histórica têm maior probabilidade de reativar com incentivo leve",
      });
      expect(r.success).toBe(true);
    });

    it("rejeita saída sem campos obrigatórios (Invariante nº 8 — falha não propaga)", () => {
      const r = SugestaoCampanhaOutputSchema.safeParse({ titulo: "X" });
      expect(r.success).toBe(false);
    });

    it("rejeita desconto acima de 100%", () => {
      const r = SugestaoCampanhaOutputSchema.safeParse({
        titulo: "Campanha",
        segmentoDescricao: "Segmento válido com descrição",
        oferta: "Desconto absurdo nos produtos",
        descontoMinimo: 150,
        justificativa: "Justificativa de teste para validar limite",
      });
      expect(r.success).toBe(false);
    });
  });

  describe("Validação de saída — Insight (Zod gate)", () => {
    it("aceita insight válido com números-fonte", () => {
      const r = InsightOutputSchema.safeParse({
        titulo: "Taxa de conversão abaixo da média",
        conteudo: "A conversão do funil caiu 15% em relação ao mês anterior (de 8% para 6.8%).",
        numerosFonte: { conversaoAtual: "6.8%", conversaoAnterior: "8%", quedaRelativa: "15%" },
        confianca: 0.85,
      });
      expect(r.success).toBe(true);
    });

    it("rejeita confiança acima de 1", () => {
      const r = InsightOutputSchema.safeParse({
        titulo: "Insight inválido",
        conteudo: "Conteúdo de teste com mais de vinte caracteres para validar",
        numerosFonte: {},
        confianca: 1.5,
      });
      expect(r.success).toBe(false);
    });
  });
});
