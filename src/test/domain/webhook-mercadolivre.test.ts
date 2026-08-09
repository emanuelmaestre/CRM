import { createHmac } from "crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolverContaWebhookMarketplace: vi.fn(),
  obterTokenMercadoLivre: vi.fn(),
  ingerirPedido: vi.fn(),
  receberMensagem: vi.fn(),
}));

vi.mock("@/modules/canais/application/webhook-account.service", () => ({
  resolverContaWebhookMarketplace: mocks.resolverContaWebhookMarketplace,
}));
vi.mock("@/modules/canais/infrastructure/mercadolivre.provider", () => ({
  obterTokenMercadoLivre: mocks.obterTokenMercadoLivre,
}));
vi.mock("@/modules/canais/application/ingestao-pedido.service", () => ({
  ingerirPedido: mocks.ingerirPedido,
}));
vi.mock("@/modules/inbox/application/inbox.service", () => ({
  receberMensagem: mocks.receberMensagem,
}));

const { POST } = await import("@/app/api/webhooks/mercadolivre/route");

const CONTA = {
  orgId: "22222222-2222-4222-8222-222222222222",
  brandId: "33333333-3333-4333-8333-333333333333",
  brandSlug: "karzi",
  channelAccountId: "44444444-4444-4444-8444-444444444444",
};

function assinar(body: string, requestId: string, secret: string, ts = String(Date.now())) {
  const payload = `x-request-id:${requestId};request-id:${requestId};ts:${ts}`;
  const v1 = createHmac("sha256", secret).update(payload).digest("hex");
  return { signature: `ts=${ts},v1=${v1}`, requestId };
}

function montarRequest(body: unknown, headers: Record<string, string> = {}) {
  const raw = JSON.stringify(body);
  return new NextRequest("http://localhost/api/webhooks/mercadolivre", {
    method: "POST",
    body: raw,
    headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(raw)), ...headers },
  });
}

describe("webhook Mercado Livre", () => {
  const SECRET = "segredo-teste-ml";
  let originalSecret: string | undefined;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalSecret = process.env.ML_CLIENT_SECRET;
    process.env.ML_CLIENT_SECRET = SECRET;
    originalFetch = global.fetch;
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.ML_CLIENT_SECRET;
    else process.env.ML_CLIENT_SECRET = originalSecret;
    global.fetch = originalFetch;
  });

  it("rejeita quando o secret não está configurado", async () => {
    delete process.env.ML_CLIENT_SECRET;
    const req = montarRequest({ topic: "orders_v2", resource: "/orders/1", user_id: "1" });
    const res = await POST(req);
    expect(res.status).toBe(503);
  });

  it("rejeita quando a assinatura está ausente", async () => {
    const req = montarRequest({ topic: "orders_v2", resource: "/orders/1", user_id: "1" });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("rejeita quando a assinatura é inválida", async () => {
    const body = { topic: "orders_v2", resource: "/orders/1", user_id: "1" };
    const req = montarRequest(body, {
      "x-signature": "ts=123,v1=assinaturaerrada",
      "x-request-id": "req-1",
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("rejeita payload que excede o limite de tamanho declarado", async () => {
    const body = { topic: "orders_v2", resource: "/orders/1", user_id: "1" };
    const raw = JSON.stringify(body);
    const { signature, requestId } = assinar(raw, "req-2", SECRET);
    const req = new NextRequest("http://localhost/api/webhooks/mercadolivre", {
      method: "POST",
      body: raw,
      headers: {
        "content-type": "application/json",
        "content-length": String(1_048_577),
        "x-signature": signature,
        "x-request-id": requestId,
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(413);
  });

  it("rejeita JSON malformado", async () => {
    const raw = "{ isso não é json";
    const { signature, requestId } = assinar(raw, "req-3", SECRET);
    const req = new NextRequest("http://localhost/api/webhooks/mercadolivre", {
      method: "POST",
      body: raw,
      headers: {
        "content-type": "application/json",
        "content-length": String(Buffer.byteLength(raw)),
        "x-signature": signature,
        "x-request-id": requestId,
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rejeita payload que não bate com o schema esperado", async () => {
    const body = { topic: "orders_v2" }; // falta resource e user_id
    const raw = JSON.stringify(body);
    const { signature, requestId } = assinar(raw, "req-4", SECRET);
    const req = new NextRequest("http://localhost/api/webhooks/mercadolivre", {
      method: "POST",
      body: raw,
      headers: {
        "content-type": "application/json",
        "content-length": String(Buffer.byteLength(raw)),
        "x-signature": signature,
        "x-request-id": requestId,
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
  });

  it("ignora tópicos fora da lista suportada sem chamar a API do ML", async () => {
    const body = { topic: "payments", resource: "/payments/1", user_id: "1" };
    const raw = JSON.stringify(body);
    const { signature, requestId } = assinar(raw, "req-5", SECRET);
    const req = new NextRequest("http://localhost/api/webhooks/mercadolivre", {
      method: "POST",
      body: raw,
      headers: {
        "content-type": "application/json",
        "content-length": String(Buffer.byteLength(raw)),
        "x-signature": signature,
        "x-request-id": requestId,
      },
    });
    const res = await POST(req);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, ignorado: true, topic: "payments" });
    expect(mocks.resolverContaWebhookMarketplace).not.toHaveBeenCalled();
  });

  it("processa notificação de pedido (orders_v2) e chama ingerirPedido", async () => {
    mocks.resolverContaWebhookMarketplace.mockResolvedValue(CONTA);
    mocks.obterTokenMercadoLivre.mockResolvedValue({ accessToken: "token-abc" });
    mocks.ingerirPedido.mockResolvedValue({ pedidoId: "pedido-1", criado: true });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 999,
        status: "paid",
        total_amount: 150.5,
        shipping: { cost: 10 },
        buyer: { id: 42, nickname: "comprador", email: "comprador@example.com" },
        order_items: [{ item: { seller_sku: "SKU-1" }, quantity: 2, unit_price: 70.25 }],
        date_created: "2026-01-01T10:00:00Z",
      }),
    }) as unknown as typeof fetch;

    const body = { topic: "orders_v2", resource: "/orders/999", user_id: "555" };
    const raw = JSON.stringify(body);
    const { signature, requestId } = assinar(raw, "req-6", SECRET);
    const req = new NextRequest("http://localhost/api/webhooks/mercadolivre", {
      method: "POST",
      body: raw,
      headers: {
        "content-type": "application/json",
        "content-length": String(Buffer.byteLength(raw)),
        "x-signature": signature,
        "x-request-id": requestId,
      },
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({ ok: true, pedidoId: "pedido-1" });
    expect(mocks.resolverContaWebhookMarketplace).toHaveBeenCalledWith("mercadolivre", "555");
    expect(mocks.ingerirPedido).toHaveBeenCalledWith(
      CONTA.orgId,
      CONTA.brandId,
      CONTA.channelAccountId,
      expect.objectContaining({
        providerOrderId: "999",
        canal: "mercadolivre",
        clienteExternalId: "42",
        total: "150.5",
      }),
    );
  });

  it("ignora pedido sem order-id no resource", async () => {
    mocks.resolverContaWebhookMarketplace.mockResolvedValue(CONTA);
    mocks.obterTokenMercadoLivre.mockResolvedValue({ accessToken: "token-abc" });

    const body = { topic: "orders_v2", resource: "/nao-tem-order", user_id: "555" };
    const raw = JSON.stringify(body);
    const { signature, requestId } = assinar(raw, "req-7", SECRET);
    const req = new NextRequest("http://localhost/api/webhooks/mercadolivre", {
      method: "POST",
      body: raw,
      headers: {
        "content-type": "application/json",
        "content-length": String(Buffer.byteLength(raw)),
        "x-signature": signature,
        "x-request-id": requestId,
      },
    });
    const res = await POST(req);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, ignorado: true, motivo: "sem-order-id" });
    expect(mocks.ingerirPedido).not.toHaveBeenCalled();
  });

  it("processa notificação de mensagem (messages) e chama receberMensagem", async () => {
    mocks.resolverContaWebhookMarketplace.mockResolvedValue(CONTA);
    mocks.obterTokenMercadoLivre.mockResolvedValue({ accessToken: "token-abc" });
    mocks.receberMensagem.mockResolvedValue({ conversaId: "conversa-1" });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message_id: "msg-1",
        date: "2026-01-01T10:00:00Z",
        from: { user_id: 42 },
        text: { plain: "Olá, chegou meu pedido?" },
        conversation_id: "conv-1",
        pack_id: 987,
      }),
    }) as unknown as typeof fetch;

    const body = { topic: "messages", resource: "/messages/msg-1", user_id: "555" };
    const raw = JSON.stringify(body);
    const { signature, requestId } = assinar(raw, "req-8", SECRET);
    const req = new NextRequest("http://localhost/api/webhooks/mercadolivre", {
      method: "POST",
      body: raw,
      headers: {
        "content-type": "application/json",
        "content-length": String(Buffer.byteLength(raw)),
        "x-signature": signature,
        "x-request-id": requestId,
      },
    });
    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toMatchObject({ ok: true, conversaId: "conversa-1" });
    expect(mocks.receberMensagem).toHaveBeenCalledWith(expect.objectContaining({
      conteudo: "Olá, chegou meu pedido?",
      providerMessageId: "ml-message:msg-1",
    }));
  });

  it("ignora mensagem sem texto/subject", async () => {
    mocks.resolverContaWebhookMarketplace.mockResolvedValue(CONTA);
    mocks.obterTokenMercadoLivre.mockResolvedValue({ accessToken: "token-abc" });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message_id: "msg-2" }),
    }) as unknown as typeof fetch;

    const body = { topic: "messages", resource: "/messages/msg-2", user_id: "555" };
    const raw = JSON.stringify(body);
    const { signature, requestId } = assinar(raw, "req-9", SECRET);
    const req = new NextRequest("http://localhost/api/webhooks/mercadolivre", {
      method: "POST",
      body: raw,
      headers: {
        "content-type": "application/json",
        "content-length": String(Buffer.byteLength(raw)),
        "x-signature": signature,
        "x-request-id": requestId,
      },
    });
    const res = await POST(req);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, ignorado: true, motivo: "mensagem-sem-texto" });
    expect(mocks.receberMensagem).not.toHaveBeenCalled();
  });

  it("processa notificação de pergunta (questions) e chama receberMensagem", async () => {
    mocks.resolverContaWebhookMarketplace.mockResolvedValue(CONTA);
    mocks.obterTokenMercadoLivre.mockResolvedValue({ accessToken: "token-abc" });
    mocks.receberMensagem.mockResolvedValue({ conversaId: "conversa-2" });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 77,
        text: "Tem em outra cor?",
        date_created: "2026-01-01T10:00:00Z",
        item_id: "MLB123",
        from: { id: 42 },
      }),
    }) as unknown as typeof fetch;

    const body = { topic: "questions", resource: "/questions/77", user_id: "555" };
    const raw = JSON.stringify(body);
    const { signature, requestId } = assinar(raw, "req-10", SECRET);
    const req = new NextRequest("http://localhost/api/webhooks/mercadolivre", {
      method: "POST",
      body: raw,
      headers: {
        "content-type": "application/json",
        "content-length": String(Buffer.byteLength(raw)),
        "x-signature": signature,
        "x-request-id": requestId,
      },
    });
    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toMatchObject({ ok: true, conversaId: "conversa-2" });
    expect(mocks.receberMensagem).toHaveBeenCalledWith(expect.objectContaining({
      externalConversaId: "ml-question:77",
      conteudo: "Tem em outra cor?",
      meta: expect.objectContaining({ questionId: "77", itemId: "MLB123" }),
    }));
  });

  it("retorna 500 e não vaza detalhes quando a conta do webhook não é resolvida", async () => {
    mocks.resolverContaWebhookMarketplace.mockRejectedValue(new Error("conta não encontrada"));

    const body = { topic: "orders_v2", resource: "/orders/1", user_id: "999" };
    const raw = JSON.stringify(body);
    const { signature, requestId } = assinar(raw, "req-11", SECRET);
    const req = new NextRequest("http://localhost/api/webhooks/mercadolivre", {
      method: "POST",
      body: raw,
      headers: {
        "content-type": "application/json",
        "content-length": String(Buffer.byteLength(raw)),
        "x-signature": signature,
        "x-request-id": requestId,
      },
    });
    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(500);
    expect(json).toEqual({ error: "Erro interno" });
  });
});
