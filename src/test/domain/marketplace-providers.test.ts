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

  it("descobre anúncios e prioriza SELLER_SKU nas variações", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "seller-1" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        results: ["MLB-1"],
        paging: { total: 1, offset: 0, limit: 50 },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{
        code: 200,
        body: {
          id: "MLB-1",
          title: "Produto com variação",
          price: 49.9,
          status: "active",
          permalink: "https://produto.mercadolivre.com.br/MLB-1",
          attributes: [{ id: "SELLER_SKU", value_name: "SKU-PAI" }],
          variations: [{
            id: 12345,
            available_quantity: 7,
            attributes: [{ id: "SELLER_SKU", value_name: "SKU-AZUL" }],
            attribute_combinations: [{ name: "Cor", value_name: "Azul" }],
          }],
        },
      }]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new MercadoLivreProvider({
      clientId: "client",
      clientSecret: "secret",
      accessToken: "token",
      refreshToken: "refresh",
    });
    const catalog = await provider.listarAnunciosAtivos();

    expect(catalog.totalListings).toBe(1);
    expect(catalog.items).toEqual([expect.objectContaining({
      listingId: "MLB-1",
      variationId: "12345",
      externalSku: "SKU-AZUL",
      variationLabel: "Azul",
      availableQuantity: 7,
      price: "49.9",
    })]);
    expect(String(fetchMock.mock.calls[2][0])).toContain("include_attributes=all");
  });

  it("sincroniza o saldo da variação mapeada sem alterar o anúncio pai", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new MercadoLivreProvider({
      clientId: "client",
      clientSecret: "secret",
      accessToken: "token",
      refreshToken: "refresh",
    });

    await provider.sincronizarEstoque({ listingId: "MLB-1", warehouseId: "12345" }, 9);

    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({
      variations: [{ id: 12345, available_quantity: 9 }],
    });
  });

  it("sincroniza título e preço do anúncio (item raiz, sem variação)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new MercadoLivreProvider({
      clientId: "client",
      clientSecret: "secret",
      accessToken: "token",
      refreshToken: "refresh",
    });

    await provider.sincronizarAnuncio({ listingId: "MLB-1" }, { titulo: "Camiseta Azul", preco: "49.90" });

    expect(String(fetchMock.mock.calls[0][0])).toContain("/items/MLB-1");
    expect(fetchMock.mock.calls[0][1].method).toBe("PUT");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({
      title: "Camiseta Azul",
      price: 49.9,
    });
  });

  it("sincroniza preço na variação mapeada, mas título sempre no item pai", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new MercadoLivreProvider({
      clientId: "client",
      clientSecret: "secret",
      accessToken: "token",
      refreshToken: "refresh",
    });

    await provider.sincronizarAnuncio({ listingId: "MLB-1", warehouseId: "12345" }, { titulo: "Camiseta Azul", preco: "59.90" });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({
      title: "Camiseta Azul",
      variations: [{ id: 12345, price: 59.9 }],
    });
  });

  it("rejeita preço inválido antes de chamar a API do Mercado Livre", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const provider = new MercadoLivreProvider({
      clientId: "client",
      clientSecret: "secret",
      accessToken: "token",
      refreshToken: "refresh",
    });

    await expect(provider.sincronizarAnuncio({ listingId: "MLB-1" }, { titulo: "X", preco: "0" })).rejects.toThrow(/Preço inválido/);
    await expect(provider.sincronizarAnuncio({ listingId: "MLB-1" }, { titulo: "X", preco: "abc" })).rejects.toThrow(/Preço inválido/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("propaga erro HTTP ao sincronizar anúncio", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    const provider = new MercadoLivreProvider({
      clientId: "client",
      clientSecret: "secret",
      accessToken: "token",
      refreshToken: "refresh",
    });

    await expect(provider.sincronizarAnuncio({ listingId: "MLB-1" }, { titulo: "X", preco: "10.00" }))
      .rejects.toThrow(/HTTP 500/);
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
