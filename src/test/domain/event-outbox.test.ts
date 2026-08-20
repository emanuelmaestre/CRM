import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));
  const returning = vi.fn().mockResolvedValue([{ eventId: "event-persisted" }]);
  const values = vi.fn(() => ({ returning }));
  const insert = vi.fn(() => ({ values }));
  const limit = vi.fn().mockResolvedValue([]);
  const orderBy = vi.fn(() => ({ limit }));
  const selectWhere = vi.fn(() => ({ orderBy }));
  const from = vi.fn(() => ({ where: selectWhere }));
  const select = vi.fn(() => ({ from }));
  const execute = vi.fn().mockResolvedValue([]);
  const tx = { execute, select, insert };
  const transaction = vi.fn(async (callback: (input: typeof tx) => Promise<unknown>) => callback(tx));
  const send = vi.fn().mockResolvedValue({ ids: ["event-1"] });
  return {
    where,
    set,
    update,
    returning,
    values,
    insert,
    limit,
    execute,
    transaction,
    send,
  };
});

vi.mock("@/shared/lib/db", () => ({
  db: {
    update: mocks.update,
    insert: mocks.insert,
    transaction: mocks.transaction,
  },
}));
vi.mock("@/shared/lib/inngest/client", () => ({
  inngest: { send: mocks.send },
}));

import {
  despacharEvento,
  emitirEventoUnico,
  persistirEvento,
} from "@/shared/events";

describe("outbox de eventos de domínio", () => {
  beforeEach(() => vi.clearAllMocks());

  it("publica com eventId estável e marca o evento como processado", async () => {
    await despacharEvento({
      eventId: "7ba021fd-8200-4ed8-91b0-5f26711f3641",
      tipo: "pedido.pago",
      orgId: "22222222-2222-4222-8222-222222222222",
      brandId: "33333333-3333-4333-8333-333333333333",
      entidade: "pedido",
      entidadeId: "44444444-4444-4444-8444-444444444444",
      payload: { status: "pago" },
    });

    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({
      id: "7ba021fd-8200-4ed8-91b0-5f26711f3641",
      name: "pedido/pago",
    }));
    expect(mocks.set).toHaveBeenCalledWith({ processado: "true" });
  });

  it("não deixa uma falha de publicação (Inngest fora do ar, sem credencial) derrubar a operação", async () => {
    mocks.send.mockRejectedValueOnce(new Error("sem event key configurada"));
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(despacharEvento({
      eventId: "7ba021fd-8200-4ed8-91b0-5f26711f3641",
      tipo: "pedido.pago",
      orgId: "22222222-2222-4222-8222-222222222222",
      brandId: "33333333-3333-4333-8333-333333333333",
      entidade: "pedido",
      entidadeId: "44444444-4444-4444-8444-444444444444",
      payload: { status: "pago" },
    })).resolves.toBeUndefined();

    // O evento fica processado="false" (nenhum update disparado) para o job de
    // redrive encontrá-lo depois — não marca sucesso que não aconteceu.
    expect(mocks.set).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it("já grava como processado um evento que não possui consumidor no Inngest", async () => {
    await persistirEvento({
      tipo: "canal.degradado",
      orgId: "22222222-2222-4222-8222-222222222222",
      entidade: "channel_account",
      entidadeId: "44444444-4444-4444-8444-444444444444",
      payload: { motivo: "teste" },
    });

    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({
      processado: "true",
    }));
  });

  it("mantém pendente um evento que precisa ser entregue ao Inngest", async () => {
    await persistirEvento({
      tipo: "pedido.pago",
      orgId: "22222222-2222-4222-8222-222222222222",
      entidade: "pedido",
      entidadeId: "44444444-4444-4444-8444-444444444444",
      payload: { status: "pago" },
    });

    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({
      processado: "false",
    }));
  });

  it("protege consulta e inserção do evento único na mesma transação", async () => {
    await expect(emitirEventoUnico({
      tipo: "canal.degradado",
      orgId: "22222222-2222-4222-8222-222222222222",
      entidade: "channel_account",
      entidadeId: "44444444-4444-4444-8444-444444444444",
      payload: { motivo: "teste" },
    })).resolves.toBe(true);

    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.insert).toHaveBeenCalledOnce();
  });

  it("não insere nem despacha quando já existe evento dentro da janela", async () => {
    mocks.limit.mockResolvedValueOnce([{ id: "evento-existente" }]);

    await expect(emitirEventoUnico({
      tipo: "canal.degradado",
      orgId: "22222222-2222-4222-8222-222222222222",
      entidade: "channel_account",
      entidadeId: "44444444-4444-4444-8444-444444444444",
      payload: { motivo: "teste" },
    })).resolves.toBe(false);

    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
