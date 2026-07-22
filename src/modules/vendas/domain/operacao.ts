import { z } from "zod";

const IdOpcionalSchema = z.union([z.string().uuid(), z.literal("")]).optional();

function dataOpcional(value: unknown) {
  return value === "" || value === null || value === undefined ? undefined : value;
}

export const TarefaStatusSchema = z.enum(["pendente", "em_andamento", "concluida", "cancelada"]);

export const CriarTarefaSchema = z.object({
  titulo: z.string().trim().min(2).max(160),
  descricao: z.string().trim().max(2_000).optional(),
  clienteId: IdOpcionalSchema,
  responsavelId: IdOpcionalSchema,
  vencimentoEm: z.preprocess(dataOpcional, z.coerce.date().optional()),
});

export const AtualizarStatusTarefaSchema = z.object({
  tarefaId: z.string().uuid(),
  status: TarefaStatusSchema,
});

export const CriarEventoAgendaSchema = z.object({
  titulo: z.string().trim().min(2).max(160),
  clienteId: IdOpcionalSchema,
  responsavelId: IdOpcionalSchema,
  inicio: z.coerce.date(),
  fim: z.preprocess(dataOpcional, z.coerce.date().optional()),
}).refine((data) => !data.fim || data.fim > data.inicio, {
  message: "O fim deve ser posterior ao início.",
  path: ["fim"],
});

export const FiltrosTarefaSchema = z.object({
  busca: z.string().trim().max(120).optional(),
  status: z.union([TarefaStatusSchema, z.literal("")]).optional(),
  responsavelId: IdOpcionalSchema,
});

export const FiltrosAgendaSchema = z.object({
  inicio: z.coerce.date(),
  fim: z.coerce.date(),
  responsavelId: IdOpcionalSchema,
}).refine((data) => data.fim > data.inicio, {
  message: "O período final deve ser posterior ao inicial.",
  path: ["fim"],
});

export type CriarTarefaDTO = z.input<typeof CriarTarefaSchema>;
export type CriarEventoAgendaDTO = z.input<typeof CriarEventoAgendaSchema>;
export type FiltrosTarefaDTO = z.input<typeof FiltrosTarefaSchema>;
export type FiltrosAgendaDTO = z.input<typeof FiltrosAgendaSchema>;
