import { z } from "zod";
import type { PedidoStatus } from "./state-machine";

export const CANAIS_VENDA = ["mercadolivre", "shopee", "tiktokshop"] as const;
export type CanalVenda = (typeof CANAIS_VENDA)[number];

const PedidoStatusSchema = z.enum([
  "criado", "pago", "separado", "enviado", "entregue",
  "avaliacao_solicitada", "concluido", "cancelado", "devolvido",
]);

const ConsultaPedidosEntradaSchema = z.object({
  brandIds: z.array(z.string().uuid()).optional(),
  canal: z.enum(CANAIS_VENDA).optional(),
  status: PedidoStatusSchema.optional(),
  busca: z.string().trim().max(100).optional(),
  inicio: z.string().datetime({ offset: true }).optional(),
  fim: z.string().datetime({ offset: true }).optional(),
  offset: z.number().int().nonnegative().optional(),
});

export interface ConsultaPedidos {
  brandIds?: string[];
  canal?: CanalVenda;
  status?: PedidoStatus;
  busca?: string;
  inicio?: Date;
  fim?: Date;
}

/** Fronteira única entre a action (entrada não confiável) e o caso de uso. */
export function normalizarConsultaPedidos(entrada: unknown): ConsultaPedidos & { offset: number } {
  const candidata = typeof entrada === "object" && entrada !== null ? entrada as Record<string, unknown> : {};
  const validada = ConsultaPedidosEntradaSchema.parse({
    ...candidata,
    brandIds: Array.isArray(candidata.brandIds) && candidata.brandIds.length ? candidata.brandIds : undefined,
    canal: candidata.canal || undefined,
    status: candidata.status || undefined,
    busca: candidata.busca || undefined,
    inicio: candidata.inicio || undefined,
    fim: candidata.fim || undefined,
  });

  return {
    ...validada,
    inicio: validada.inicio ? new Date(validada.inicio) : undefined,
    fim: validada.fim ? new Date(validada.fim) : undefined,
    offset: validada.offset ?? 0,
  };
}
