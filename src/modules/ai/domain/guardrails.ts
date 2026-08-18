import { z } from "zod";

export const MODELOS = {
  triagem: "gpt-4.1-mini",
  insight: "gpt-4.1",
} as const;

export type ModeloIA = (typeof MODELOS)[keyof typeof MODELOS];

// Custo estimado por 1k tokens (USD)
const CUSTO_POR_1K: Record<ModeloIA, { input: number; output: number }> = {
  "gpt-4.1-mini": { input: 0.0004, output: 0.0016 },
  "gpt-4.1":      { input: 0.002,   output: 0.008 },
};

export function calcularCusto(modelo: ModeloIA, tokensInput: number, tokensOutput: number): number {
  const custo = CUSTO_POR_1K[modelo];
  return (tokensInput / 1000) * custo.input + (tokensOutput / 1000) * custo.output;
}

export const SugestaoCampanhaOutputSchema = z.object({
  titulo: z.string().min(5).max(100),
  segmentoDescricao: z.string().min(10).max(500),
  oferta: z.string().min(10).max(500),
  momentoSugerido: z.string().min(5).max(200),
  descontoMinimo: z.number().min(0).max(100),
  justificativa: z.string().min(10).max(1000),
});

export const InsightOutputSchema = z.object({
  titulo: z.string().min(5).max(150),
  conteudo: z.string().min(20).max(2000),
  numerosFonte: z.array(z.object({
    nome: z.string().min(1).max(100),
    valor: z.union([z.string(), z.number()]),
  })).min(1).max(30),
  confianca: z.number().min(0).max(1),
});

export type SugestaoCampanhaOutput = z.infer<typeof SugestaoCampanhaOutputSchema>;
export type InsightOutput = z.infer<typeof InsightOutputSchema>;

export const DocumentoExecutivoOutputSchema = z.object({
  titulo: z.string().min(5).max(150),
  resumo: z.string().min(50).max(3000),
  destaques: z.array(z.string()).min(1).max(10),
  alertas: z.array(z.string()).min(0).max(10),
  recomendacoes: z.array(z.string()).min(1).max(10),
});

export type DocumentoExecutivoOutput = z.infer<typeof DocumentoExecutivoOutputSchema>;

export const OPENAI_JSON_SCHEMAS = {
  sugestao_campanha: {
    type: "object", additionalProperties: false,
    required: ["titulo", "segmentoDescricao", "oferta", "momentoSugerido", "descontoMinimo", "justificativa"],
    properties: {
      titulo: { type: "string", minLength: 5, maxLength: 100 },
      segmentoDescricao: { type: "string", minLength: 10, maxLength: 500 },
      oferta: { type: "string", minLength: 10, maxLength: 500 },
      momentoSugerido: { type: "string", minLength: 5, maxLength: 200 },
      descontoMinimo: { type: "number", minimum: 0, maximum: 100 },
      justificativa: { type: "string", minLength: 10, maxLength: 1000 },
    },
  },
  insight_funil: {
    type: "object", additionalProperties: false,
    required: ["titulo", "conteudo", "numerosFonte", "confianca"],
    properties: {
      titulo: { type: "string", minLength: 5, maxLength: 150 },
      conteudo: { type: "string", minLength: 20, maxLength: 2000 },
      numerosFonte: {
        type: "array", minItems: 1, maxItems: 30,
        items: {
          type: "object", additionalProperties: false, required: ["nome", "valor"],
          properties: {
            nome: { type: "string", minLength: 1, maxLength: 100 },
            valor: { anyOf: [{ type: "string" }, { type: "number" }] },
          },
        },
      },
      confianca: { type: "number", minimum: 0, maximum: 1 },
    },
  },
  documento_executivo: {
    type: "object", additionalProperties: false,
    required: ["titulo", "resumo", "destaques", "alertas", "recomendacoes"],
    properties: {
      titulo: { type: "string", minLength: 5, maxLength: 150 },
      resumo: { type: "string", minLength: 50, maxLength: 3000 },
      destaques: { type: "array", minItems: 1, maxItems: 10, items: { type: "string" } },
      alertas: { type: "array", minItems: 0, maxItems: 10, items: { type: "string" } },
      recomendacoes: { type: "array", minItems: 1, maxItems: 10, items: { type: "string" } },
    },
  },
} as const;

export function podeTransicionarSugestao(
  statusAtual: string,
  destino: "aprovada" | "rejeitada",
  expiradoEm: Date | null,
  agora = new Date(),
): boolean {
  return statusAtual === "sugerida" && (!expiradoEm || expiradoEm > agora) &&
    (destino === "aprovada" || destino === "rejeitada");
}

export const AVISO_PROBABILISTICO =
  "⚠️ Este resultado é gerado por IA probabilística (Cláusula 11.3). " +
  "Decisões de desconto e campanha devem ser validadas pela equipe Elisa Lima.";
