import crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TikTokShopProvider } from "@/modules/canais/infrastructure/tiktokshop.provider";

describe("TikTok Shop provider v202309", () => {
  afterEach(() => vi.restoreAllMocks());

  it("assina corpo, usa shop_cipher e envia token somente no header", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_720_000_000_000);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      code: 0,
      data: { orders: [{
        id: "order-1",
        status: "AWAITING_SHIPMENT",
        payment: { total_amount: "10.00" },
        buyer_uid: "buyer-1",
        create_time: 1_719_999_000,
        line_items: [{ seller_sku: "SKU-1", quantity: 1, sale_price: "10.00" }],
      }] },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new TikTokShopProvider({
      appKey: "app-key",
      appSecret: "secret",
      accessToken: "access-token",
      shopCipher: "shop-cipher",
    });
    const pedidos = await provider.buscarPedidos(new Date("2024-07-03T00:00:00Z"));

    expect(pedidos).toHaveLength(1);
    const [urlString, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const url = new URL(urlString);
    expect(url.searchParams.get("shop_cipher")).toBe("shop-cipher");
    expect(url.searchParams.has("access_token")).toBe(false);
    expect((init.headers as Record<string, string>)["x-tts-access-token"]).toBe("access-token");

    const body = init.body as string;
    const params = Object.fromEntries([...url.searchParams].filter(([key]) => key !== "sign"));
    const paramString = Object.keys(params).sort().map((key) => `${key}${params[key]}`).join("");
    const base = `secret/order/202309/orders/search${paramString}${body}secret`;
    const esperado = crypto.createHmac("sha256", "secret").update(base).digest("hex");
    expect(url.searchParams.get("sign")).toBe(esperado);
  });
});
