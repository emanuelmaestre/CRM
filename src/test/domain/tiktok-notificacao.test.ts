import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ ingerir: vi.fn(), reembolsos: vi.fn(), buscar: vi.fn() }));
vi.mock("@/modules/canais/application/ingestao-pedido.service", () => ({ ingerirPedido: m.ingerir }));
vi.mock("@/modules/canais/application/reembolsos-tiktok.service", () => ({ conciliarReembolsosTikTok: m.reembolsos }));
vi.mock("@/modules/canais/application/recepcao-pedido.service", () => ({ buscarPedidoComRegistro: (_conta: unknown, _id: string, buscar: () => Promise<unknown>) => buscar() }));
vi.mock("@/modules/canais/application/tiktok-autorizacao.service", () => ({ resolverContaTikTokPorLoja: async () => ({ orgId: "org", channelAccountId: "conta", brandId: "marca", brandSlug: "wuwu" }) }));
vi.mock("@/modules/canais/infrastructure/tiktokshop.provider", () => ({ criarTikTokShopProvider: async () => ({ buscarPedidosPorIds: m.buscar }) }));
import { processarNotificacaoPedidoTikTok } from "@/modules/canais/application/processar-notificacao-tiktok.service";

describe("notificação TikTok", () => {
  beforeEach(() => { vi.clearAllMocks(); m.buscar.mockResolvedValue([{ providerOrderId: "123" }]); m.ingerir.mockResolvedValue({ pedidoId: "local", novo: false }); m.reembolsos.mockResolvedValue({}); });
  it("consulta o pós-venda por pedido no evento de devolução", async () => {
    await processarNotificacaoPedidoTikTok("loja", "123", 12);
    expect(m.buscar).toHaveBeenCalledWith(["123"]);
    expect(m.reembolsos).toHaveBeenCalledWith(expect.objectContaining({ orgId: "org", channelAccountId: "conta", orderIds: ["123"] }));
  });
  it("evento de pedido comum não dispara consulta de devoluções", async () => {
    await processarNotificacaoPedidoTikTok("loja", "123", 1);
    expect(m.reembolsos).not.toHaveBeenCalled();
  });
  it("falha de pós-venda propaga para a retentativa durável", async () => {
    m.reembolsos.mockRejectedValue(new Error("temporário"));
    await expect(processarNotificacaoPedidoTikTok("loja", "123", 12)).rejects.toThrow("temporário");
  });
});
