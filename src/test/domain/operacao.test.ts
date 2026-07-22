import { describe, expect, it } from "vitest";
import {
  AtualizarStatusTarefaSchema,
  CriarEventoAgendaSchema,
  CriarTarefaSchema,
  FiltrosAgendaSchema,
} from "@/modules/vendas/domain/operacao";

const uuid = "123e4567-e89b-42d3-a456-426614174000";

describe("tarefas e agenda", () => {
  it("normaliza dados opcionais da tarefa", () => {
    const result = CriarTarefaSchema.parse({
      titulo: "  Retornar cliente  ", descricao: "", clienteId: "", responsavelId: "", vencimentoEm: "",
    });
    expect(result.titulo).toBe("Retornar cliente");
    expect(result.vencimentoEm).toBeUndefined();
  });

  it("valida status e identificador da tarefa", () => {
    expect(AtualizarStatusTarefaSchema.parse({ tarefaId: uuid, status: "concluida" }).status).toBe("concluida");
    expect(() => AtualizarStatusTarefaSchema.parse({ tarefaId: "inválido", status: "aberta" })).toThrow();
  });

  it("rejeita evento com fim anterior ao início", () => {
    expect(() => CriarEventoAgendaSchema.parse({
      titulo: "Reunião", inicio: "2026-07-22T15:00:00Z", fim: "2026-07-22T14:00:00Z",
    })).toThrow(/posterior/);
  });

  it("rejeita período de agenda invertido", () => {
    expect(() => FiltrosAgendaSchema.parse({
      inicio: "2026-07-23T00:00:00Z", fim: "2026-07-22T00:00:00Z",
    })).toThrow(/posterior/);
  });
});
