import { z } from "zod";

const ValorSchema = z.string().trim()
  .regex(/^\d+(?:[.,]\d{1,2})?$/, "Valor inválido")
  .transform((value) => value.replace(",", "."))
  .optional()
  .or(z.literal(""));

export const CriarOportunidadeSchema = z.object({
  titulo: z.string().trim().min(2, "Título deve ter ao menos 2 caracteres").max(160),
  etapaId: z.string().uuid(),
  brandId: z.string().uuid(),
  clienteId: z.string().uuid().optional().or(z.literal("")),
  responsavelId: z.string().uuid().optional().or(z.literal("")),
  valor: ValorSchema,
});

export const MoverOportunidadeSchema = z.object({
  oportunidadeId: z.string().uuid(),
  novaEtapaId: z.string().uuid(),
  motivoPerda: z.string().trim().min(3).max(300).optional().or(z.literal("")),
});

export type CriarOportunidadeDTO = z.input<typeof CriarOportunidadeSchema>;
