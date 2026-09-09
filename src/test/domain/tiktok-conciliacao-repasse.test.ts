import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ listarExtratos: vi.fn(), listarTransacoesDoExtrato: vi.fn() }));
vi.mock("@/modules/canais/infrastructure/tiktokshop.provider", async (original) => ({
  ...await original<object>(), criarTikTokShopProvider: async () => mocks,
}));
import { conciliarRepassesTikTok } from "@/modules/canais/application/repasse-tiktok.service";
import type { db } from "@/shared/lib/db";

describe("conciliação histórica TikTok", () => {
  beforeEach(() => vi.clearAllMocks());
  it("busca o recebimento anterior à janela e divide extratos em etapas retomáveis", async () => {
    mocks.listarExtratos.mockResolvedValue(["antigo", "recente"]);
    mocks.listarTransacoesDoExtrato.mockImplementation(async (id) => [{ order_id: "pedido", currency: "BRL", settlement_amount: id === "antigo" ? "80" : "-80" }]);
    const execute = vi.fn().mockResolvedValueOnce([{ inicio: "2026-06-01T00:00:00Z" }]).mockResolvedValue([]);
    const nomes: string[] = [];
    const r = await conciliarRepassesTikTok({ orgId: "org", channelAccountId: "conta", brandSlug: "wuwu",
      desde: new Date("2026-08-01T00:00:00Z"), ate: new Date("2026-09-09T12:00:00Z"),
      banco: { execute } as unknown as typeof db,
      executarEtapa: async (nome, executar) => { nomes.push(nome); return executar(); },
    });
    expect(mocks.listarExtratos).toHaveBeenCalledWith(Date.parse("2026-06-01T00:00:00Z"), Date.parse("2026-09-09T12:00:00Z"));
    expect(r.repasses).toBe(1);
    expect(nomes).toEqual(["periodo", "extratos", "extrato-antigo", "extrato-recente", "gravar-0"]);
  });
  it("não grava uma soma parcial se um demonstrativo falhar", async () => {
    mocks.listarExtratos.mockResolvedValue(["falha"]);
    mocks.listarTransacoesDoExtrato.mockRejectedValue(new Error("indisponível"));
    const execute = vi.fn().mockResolvedValue([{ inicio: "2026-06-01T00:00:00Z" }]);
    await expect(conciliarRepassesTikTok({ orgId: "org", channelAccountId: "conta", brandSlug: "wuwu", banco: { execute } as unknown as typeof db })).rejects.toThrow("indisponível");
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
