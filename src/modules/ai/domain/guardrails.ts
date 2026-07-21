import { z } from "zod";

export const MODELOS = {
  triagem: "gpt-4.1-mini",
  insight: "gpt-4.1",
} as const;

export type ModeloIA = (typeof MODELOS)[keyof typeof MODELOS];

// Custo estimado por 1k tokens (USD)
const CUSTO_POR_1K: Record<ModeloIA, { input: number; output: number }> = {
  "gpt-4.1-mini": { input: 0.00015, output: 0.0006 },
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
  descontoMinimo: z.number().min(0).max(100),
  justificativa: z.string().min(10).max(1000),
});

export const InsightOutputSchema = z.object({
  titulo: z.string().min(5).max(150),
  conteudo: z.string().min(20).max(2000),
  numerosFonte: z.record(z.string(), z.union([z.string(), z.number()])),
  confianca: z.number().min(0).max(1),
});

export type SugestaoCampanhaOutput = z.infer<typeof SugestaoCampanhaOutputSchema>;
export type InsightOutput = z.infer<typeof InsightOutputSchema>;

export const AVISO_PROBABILISTICO =
  "⚠️ Este resultado é gerado por IA probabilística (Cláusula 11.3). " +
  "Decisões de desconto e campanha devem ser validadas pela equipe Plast Leo.";
