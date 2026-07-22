import { z } from "zod";

export const FiltrosAuditoriaSchema = z.object({
  busca: z.string().trim().max(120).optional(),
  entidade: z.string().trim().max(80).optional(),
  autorTipo: z.string().trim().max(40).optional(),
  inicio: z.preprocess((value) => value || undefined, z.coerce.date().optional()),
  fim: z.preprocess((value) => value || undefined, z.coerce.date().optional()),
  pagina: z.coerce.number().int().min(1).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(50),
});

export type FiltrosAuditoriaDTO = z.input<typeof FiltrosAuditoriaSchema>;
