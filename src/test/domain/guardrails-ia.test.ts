import { describe, it, expect } from "vitest";
import {
  calcularCusto, SugestaoCampanhaOutputSchema, InsightOutputSchema,
  OPENAI_JSON_SCHEMAS, podeTransicionarSugestao,
} from "@/modules/ai/domain/guardrails";

describe("Guardrails da IA (§11)", () => {
  describe("Cálculo de custo", () => {
    it("calcula custo correto para gpt-4.1-mini", () => {
      const custo = calcularCusto("gpt-4.1-mini", 1000, 500);
      expect(custo).toBeCloseTo(0.0004 + 0.0008, 6);
    });

    it("calcula custo correto para gpt-4.1", () => {
      const custo = calcularCusto("gpt-4.1", 1000, 500);
      expect(custo).toBeCloseTo(0.002 + 0.004, 6);
    });
  });

  describe("Saída estruturada e aprovação humana", () => {
    it("usa JSON Schema estrito e sem propriedades extras", () => {
      expect(OPENAI_JSON_SCHEMAS.sugestao_campanha.additionalProperties).toBe(false);
      expect(OPENAI_JSON_SCHEMAS.insight_funil.required).toContain("numerosFonte");
    });

    it("só permite decidir sugestão pendente e não expirada", () => {
      const futuro = new Date(Date.now() + 60_000);
      const passado = new Date(Date.now() - 60_000);
      expect(podeTransicionarSugestao("sugerida", "aprovada", futuro)).toBe(true);
      expect(podeTransicionarSugestao("aprovada", "rejeitada", futuro)).toBe(false);
      expect(podeTransicionarSugestao("sugerida", "aprovada", passado)).toBe(false);
    });
  });

  describe("Validação de saída — SugestaoCampanha (Zod gate)", () => {
    it("aceita saída válida", () => {
      const r = SugestaoCampanhaOutputSchema.safeParse({
        titulo: "Reativação de clientes inativos",
        segmentoDescricao: "Clientes sem compra há mais de 90 dias com histórico de 3+ compras",
        oferta: "Frete grátis + 10% de desconto na próxima compra",
        momentoSugerido: "terça a quinta, 10h-12h",
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
        momentoSugerido: "quarta-feira, 14h",
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
        numerosFonte: [
          { nome: "conversaoAtual", valor: "6.8%" },
          { nome: "conversaoAnterior", valor: "8%" },
          { nome: "quedaRelativa", valor: "15%" },
        ],
        confianca: 0.85,
      });
      expect(r.success).toBe(true);
    });

    it("rejeita confiança acima de 1", () => {
      const r = InsightOutputSchema.safeParse({
        titulo: "Insight inválido",
        conteudo: "Conteúdo de teste com mais de vinte caracteres para validar",
        numerosFonte: [{ nome: "teste", valor: 1 }],
        confianca: 1.5,
      });
      expect(r.success).toBe(false);
    });
  });
});
