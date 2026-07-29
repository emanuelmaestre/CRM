import { z } from "zod";

// Regra de match dos filtros: um cliente pertence ao segmento se tiver
// QUALQUER UMA das tags listadas (OR). É a forma mais simples de segmentar
// sem precisar de um motor de regras — dá pra evoluir depois sem migrar dado,
// já que `filtros` é jsonb.
export const FiltrosSegmentoSchema = z.object({
  tagIds: z.array(z.string().uuid()).min(1, "Selecione ao menos uma tag"),
});

export const CriarSegmentoSchema = z.object({
  nome: z.string().trim().min(2, "Nome deve ter ao menos 2 caracteres").max(120),
  filtros: FiltrosSegmentoSchema,
});

export type FiltrosSegmento = z.infer<typeof FiltrosSegmentoSchema>;
export type CriarSegmentoDTO = z.input<typeof CriarSegmentoSchema>;
