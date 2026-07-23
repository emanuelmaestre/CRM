import { afterEach, describe, expect, it, vi } from "vitest";
import { MercadoLivreProvider } from "@/modules/canais/infrastructure/mercadolivre.provider";
import { OlistProvider } from "@/modules/canais/infrastructure/olist.provider";
import { ShopeeProvider } from "@/modules/canais/infrastructure/shopee.provider";

describe("contratos dos providers de marketplace", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("normaliza pedidos do Mercado Livre e preserva SKU, quantidade e origem", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "seller-1" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        results: [{
          id: 123,
          status: "paid",
          total_amount: 49.9,
          shipping: { cost: 5 },
          buyer: { id: 9, nickname: "buyer" },
          order_items: [{ item: { seller_sku: "SKU-1" }, quantity: 2, unit_price: 24.95 }],
          date_created: "2026-07-23T06:00:00.000Z",
        }],
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new MercadoLivreProvider({
      clientId: "client",
      clientSecret: "secret",
      accessToken: "token",
      refreshToken: "refresh",
    });
    const pedidos = await provider.buscarPedidos(new Date("2026-07-23T05:55:00.000Z"));

    expect(pedidos).toEqual([expect.objectContaining({
      providerOrderId: "123",
      canal: "mercadolivre",
      status: "paid",
      itens: [{ skuExterno: "SKU-1", quantidade: 2, precoUnitario: "24.95" }],
    })]);
    expect(String(fetchMock.mock.calls[1][0])).toContain("order.date_created.from=");
  });

  it("usa assinatura Shopee v2 e rejeita pedido sem detalhe", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_784_780_000_000);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        response: {
          order_list: [{
            order_sn: "SHP-1",
            order_status: "READY_TO_SHIP",
            total_amount: 20,
            buyer_username: "buyer",
            create_time: 1_784_779_900,
          }],
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ response: { order_list: [] } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new ShopeeProvider({
      partnerId: "1",
      partnerKey: "secret",
      shopId: "2",
      accessToken: "token",
    });
    await expect(provider.buscarPedidos(new Date("2026-07-23T05:00:00.000Z")))
      .rejects.toThrow("não retornou detalhes");

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get("partner_id")).toBe("1");
    expect(url.searchParams.get("shop_id")).toBe("2");
    expect(url.searchParams.get("sign")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("segue o contrato oficial Olist Partner API com JWT, resource e stock", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        next: null,
        results: [{
          code: "OL-1",
          status: "approved",
          seller_id: "seller-1",
          total_amount: "30.00",
          total_freight: "5.00",
          created_at: "2026-07-23T06:00:00.000Z",
          customer: { name: "Cliente", document_number: "doc", phones: [{ phone: "5511" }] },
          seller_order_items: [
            { product_sku: "EXT-1", seller_product_code: "SKU-1", price: "15.00" },
            { product_sku: "EXT-1", seller_product_code: "SKU-1", price: "15.00" },
          ],
        }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OlistProvider({
      idToken: "jwt",
      sellerId: "seller-1",
      baseUrl: "https://partners-api.olist.com",
    });
    const pedidos = await provider.buscarPedidos(new Date("2026-07-23T05:55:00.000Z"));
    await provider.sincronizarEstoque({ listingId: "OLIST-SKU" }, 7);

    expect(pedidos[0]).toMatchObject({
      providerOrderId: "OL-1",
      status: "approved",
      itens: [{ skuExterno: "SKU-1", quantidade: 2, precoUnitario: "15.00" }],
    });
    const listHeaders = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(listHeaders.Authorization).toBe("JWT jwt");
    expect(String(fetchMock.mock.calls[0][0])).toContain("/v1/seller-orders/");
    expect(String(fetchMock.mock.calls[1][0])).toContain("/v1/seller-products/OLIST-SKU/");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toEqual({
      stock: [{ quantity: 7, availability_days: 0 }],
    });
  });
});
