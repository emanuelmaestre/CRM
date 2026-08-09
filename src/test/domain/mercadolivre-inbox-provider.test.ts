import { afterEach, describe, expect, it, vi } from "vitest";
import { MercadoLivreProvider } from "@/modules/canais/infrastructure/mercadolivre.provider";

describe("MercadoLivreProvider — Inbox", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function provider() {
    return new MercadoLivreProvider({
      clientId: "client",
      clientSecret: "secret",
      accessToken: "access",
      refreshToken: "refresh",
    });
  }

  it("publica resposta de pergunta na API oficial", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 123, status: "ANSWERED" }),
    }) as unknown as typeof fetch;

    await expect(provider().responderPergunta("123", "Sim, temos disponível."))
      .resolves.toEqual({ questionId: "123", status: "ANSWERED" });
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.mercadolibre.com/answers",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ question_id: 123, text: "Sim, temos disponível." }),
      }),
    );
  });

  it("envia chat pós-venda usando pack, vendedor e agente MLB", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message_id: "msg-123" }),
    }) as unknown as typeof fetch;

    await expect(provider().enviarMensagemPosVenda({
      packId: "20000001",
      sellerId: "555",
      texto: "Seu pedido já foi enviado.",
    })).resolves.toEqual({ providerMessageId: "msg-123" });
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.mercadolibre.com/messages/packs/20000001/sellers/555?tag=post_sale",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          from: { user_id: "555" },
          to: { user_id: "3037675074" },
          text: "Seu pedido já foi enviado.",
        }),
      }),
    );
  });
});
