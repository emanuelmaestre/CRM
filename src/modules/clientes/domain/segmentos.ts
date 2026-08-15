import { z } from "zod";

export const FiltrosSegmentoSchema = z.object({
  tagIds: z.array(z.string().uuid()).default([]),
  brandIds: z.array(z.string().uuid()).default([]),
  canalTipos: z.array(z.enum(["mercadolivre", "shopee", "tiktokshop"])).default([]),
  totalGastoMin: z.number().nonnegative().optional(),
  totalGastoMax: z.number().nonnegative().optional(),
  pedidosMin: z.number().int().nonnegative().optional(),
  diasSemComprarMin: z.number().int().nonnegative().optional(),
}).refine((filtros) =>
  filtros.tagIds.length > 0 || filtros.brandIds.length > 0 || filtros.canalTipos.length > 0
  || filtros.totalGastoMin !== undefined || filtros.totalGastoMax !== undefined
  || filtros.pedidosMin !== undefined || filtros.diasSemComprarMin !== undefined,
  "Defina ao menos um critério",
);

export const CriarSegmentoSchema = z.object({
  nome: z.string().trim().min(2, "Nome deve ter ao menos 2 caracteres").max(120),
  filtros: FiltrosSegmentoSchema,
});

export type FiltrosSegmento = z.infer<typeof FiltrosSegmentoSchema>;
export type CriarSegmentoDTO = z.input<typeof CriarSegmentoSchema>;
