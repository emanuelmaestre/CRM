import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));
  const send = vi.fn().mockResolvedValue({ ids: ["event-1"] });
  return { where, set, update, send };
});

vi.mock("@/shared/lib/db", () => ({
  db: { update: mocks.update },
}));
vi.mock("@/shared/lib/inngest/client", () => ({
  inngest: { send: mocks.send },
}));

import { despacharEvento } from "@/shared/events";

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
});
