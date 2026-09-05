import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolverConta: vi.fn(),
  obterToken: vi.fn(),
  criarProvider: vi.fn(),
  buscarPedidoPorId: vi.fn(),
  buscarPedidoComRegistro: vi.fn(),
  ingerirPedido: vi.fn(),
  registrarVerificacao: vi.fn(),
  etapa: vi.fn((_nome: string, tarefa: () => unknown) => tarefa()),
  finalizar: vi.fn(),
}));

vi.mock("@/modules/canais/application/webhook-account.service", () => ({
  resolverContaWebhookMarketplace: mocks.resolverConta,
}));
vi.mock("@/modules/canais/infrastructure/mercadolivre.provider", () => ({
  obterTokenMercadoLivre: mocks.obterToken,
  criarMLProvider: mocks.criarProvider,
}));
vi.mock("@/modules/canais/application/recepcao-pedido.service", () => ({
  buscarPedidoComRegistro: mocks.buscarPedidoComRegistro,
}));
vi.mock("@/modules/canais/application/ingestao-pedido.service", () => ({
  ingerirPedido: mocks.ingerirPedido,
}));
vi.mock("@/modules/canais/application/verificacao-canal.service", () => ({
  registrarVerificacaoCanal: mocks.registrarVerificacao,
}));
vi.mock("@/shared/lib/observability/sync-trace", () => ({
  iniciarSyncTrace: () => ({ etapa: mocks.etapa, finalizar: mocks.finalizar }),
}));

const { processarNotificacaoPedidoMercadoLivre } = await import(
  "@/modules/canais/application/processar-notificacao-ml.service"
);

const conta = {
  orgId: "org-1",
  brandId: "brand-1",
  channelAccountId: "conta-1",
  brandSlug: "wuwu",
};

describe("worker de webhook do Mercado Livre", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.etapa.mockImplementation((_nome: string, tarefa: () => unknown) => tarefa());
    mocks.resolverConta.mockResolvedValue(conta);
    mocks.obterToken.mockResolvedValue({ accessToken: "access", refreshToken: "refresh" });
    mocks.criarProvider.mockResolvedValue({ buscarPedidoPorId: mocks.buscarPedidoPorId });
    mocks.buscarPedidoComRegistro.mockResolvedValue({ providerOrderId: "999", canal: "mercadolivre" });
    mocks.ingerirPedido.mockResolvedValue({ pedidoId: "pedido-1", novo: true });
    mocks.registrarVerificacao.mockResolvedValue(undefined);
  });

  it("busca a fonte oficial, ingere e carimba a verificação fora da rota HTTP", async () => {
    const resultado = await processarNotificacaoPedidoMercadoLivre({
      notificationId: "ml:notificacao-1",
      orderId: "999",
      sellerId: "555",
      resource: "/orders/999",
    });

    expect(resultado).toEqual({ pedidoId: "pedido-1", novo: true });
    expect(mocks.resolverConta).toHaveBeenCalledWith("mercadolivre", "555");
    expect(mocks.buscarPedidoComRegistro).toHaveBeenCalledWith(
      expect.objectContaining({ channelAccountId: "conta-1" }),
      "999",
      expect.any(Function),
    );
    expect(mocks.ingerirPedido).toHaveBeenCalledWith(
      "org-1",
      "brand-1",
      "conta-1",
      expect.objectContaining({ providerOrderId: "999" }),
    );
    expect(mocks.registrarVerificacao).toHaveBeenCalledWith("org-1", "conta-1", "pedidos");
    expect(mocks.finalizar).toHaveBeenCalledWith("ok");
  });
});
