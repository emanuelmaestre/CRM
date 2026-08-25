import { afterEach, describe, expect, it, vi } from "vitest";
import { MercadoLivreProvider, normalizarAvaliacoesItem } from "@/modules/canais/infrastructure/mercadolivre.provider";
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

  it("inclui a nota (rating_average) do anúncio no catálogo, compartilhada entre variações", async () => {
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
          variations: [
            { id: 111, available_quantity: 3 },
            { id: 222, available_quantity: 5 },
          ],
        },
      }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        rating_average: 4.8,
        paging: { total: 27 },
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new MercadoLivreProvider({
      clientId: "client", clientSecret: "secret", accessToken: "token", refreshToken: "refresh",
    });
    const catalog = await provider.listarAnunciosAtivos({ comAvaliacoes: true });

    expect(catalog.items).toHaveLength(2);
    expect(catalog.items[0]).toMatchObject({ ratingAverage: 4.8, reviewsTotal: 27 });
    expect(catalog.items[1]).toMatchObject({ ratingAverage: 4.8, reviewsTotal: 27 });
    // uma única chamada de avaliação para os dois itens (mesmo listingId)
    expect(String(fetchMock.mock.calls[3][0])).toContain("/reviews/item/MLB-1");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("mantém nota nula quando a consulta de avaliação falha, sem derrubar o catálogo", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "seller-1" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        results: ["MLB-2"],
        paging: { total: 1, offset: 0, limit: 50 },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{
        code: 200,
        body: { id: "MLB-2", title: "Produto sem avaliação", price: 10, status: "active" },
      }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new MercadoLivreProvider({
      clientId: "client", clientSecret: "secret", accessToken: "token", refreshToken: "refresh",
    });
    const catalog = await provider.listarAnunciosAtivos({ comAvaliacoes: true });

    expect(catalog.items).toHaveLength(1);
    expect(catalog.items[0]).toMatchObject({ ratingAverage: null, reviewsTotal: null, title: "Produto sem avaliação" });
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

    // Pedidos assinam com as credenciais do app "Elisa Lima Pedidos", não com
    // as de catálogo — sem o segundo par, urlPedidos() nem chega a sair.
    const provider = new ShopeeProvider(
      { partnerId: "1", partnerKey: "secret", shopId: "2", accessToken: "token" },
      { partnerId: "1", partnerKey: "secret", shopId: "2", accessToken: "token" },
    );
    // `desde` precisa ser anterior ao Date.now() mockado (2026-07-23T04:13Z):
    // uma janela que começa no futuro não tem o que buscar e a chamada nem sai.
    await expect(provider.buscarPedidos(new Date("2026-07-20T05:00:00.000Z")))
      .rejects.toThrow("não retornou detalhes");

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get("partner_id")).toBe("1");
    expect(url.searchParams.get("shop_id")).toBe("2");
    expect(url.searchParams.get("sign")).toMatch(/^[a-f0-9]{64}$/);
  });

  // Vendedor que não preenche SKU na Shopee é comum, e nesse caso o importador
  // de catálogo cria o produto com um SKU sintético `shopee-{item}[-{model}]`.
  // O item do pedido tem que chegar com a mesma chave, senão a ingestão recusa
  // por SKU vazio e o pedido nunca entra.
  it("gera SKU sintético igual ao do catálogo quando o anúncio não tem SKU", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_784_780_000_000);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        response: { order_list: [{ order_sn: "SHP-1" }, { order_sn: "SHP-2" }] },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        response: {
          order_list: [
            {
              order_sn: "SHP-1",
              order_status: "READY_TO_SHIP",
              total_amount: 20,
              buyer_username: "comprador",
              create_time: 1_784_779_900,
              item_list: [
                // Sem SKU e com variação → sintético com sufixo do model_id.
                { item_id: 111, model_id: 222, item_sku: "", model_sku: "", model_quantity_purchased: 1, model_discounted_price: 20 },
              ],
            },
            {
              order_sn: "SHP-2",
              order_status: "READY_TO_SHIP",
              total_amount: 35,
              buyer_username: "comprador",
              create_time: 1_784_779_950,
              item_list: [
                // model_id 0 = anúncio sem variação → sintético sem sufixo.
                { item_id: 333, model_id: 0, model_quantity_purchased: 1, model_discounted_price: 15 },
                // model_sku tem precedência sobre item_sku, igual ao catálogo.
                { item_id: 444, model_id: 555, item_sku: "PAI", model_sku: "VARIACAO", model_quantity_purchased: 2, model_discounted_price: 10 },
              ],
            },
          ],
        },
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const creds = { partnerId: "1", partnerKey: "secret", shopId: "2", accessToken: "token" };
    const provider = new ShopeeProvider(creds, creds);
    const pedidos = await provider.buscarPedidos(new Date("2026-07-20T05:00:00.000Z"));

    expect(pedidos.map((p) => p.itens.map((i) => i.skuExterno))).toEqual([
      ["shopee-111-222"],
      ["shopee-333", "VARIACAO"],
    ]);
  });

});

describe("normalização de opiniões do Mercado Livre", () => {
  const resposta = {
    rating_average: 4.6,
    paging: { total: 52 },
    rating_levels: { one_star: 3, two_star: 0, three_star: 3, four_star: 5, five_star: 41 },
    reviews: [
      { id: 1, title: "Antiga", content: "Chegou certo", rate: 5, status: "published", date_created: "2024-01-10T12:00:00Z" },
      { id: 2, title: "Recente", content: "Muito bom", rate: 4, status: "published", date_created: "2025-06-02T12:00:00Z" },
    ],
  };

  it("extrai distribuição, média e total da mesma resposta", () => {
    const resultado = normalizarAvaliacoesItem(resposta);

    expect(resultado.ratingAverage).toBe(4.6);
    expect(resultado.reviewsTotal).toBe(52);
    expect(resultado.ratingLevels).toEqual({ uma: 3, duas: 0, tres: 3, quatro: 5, cinco: 41 });
  });

  it("ordena as opiniões da mais recente para a mais antiga", () => {
    const resultado = normalizarAvaliacoesItem(resposta);

    expect(resultado.opinioes.map((opiniao) => opiniao.titulo)).toEqual(["Recente", "Antiga"]);
  });

  it("descarta opinião não publicada e opinião sem texto algum", () => {
    const resultado = normalizarAvaliacoesItem({
      reviews: [
        { id: 10, title: "Escondida", content: "Removida", rate: 1, status: "deleted" },
        { id: 11, rate: 5, status: "published" },
        { id: 12, content: "Vale a pena", rate: 5, status: "published" },
      ],
    });

    expect(resultado.opinioes.map((opiniao) => opiniao.id)).toEqual(["12"]);
  });

  it("sobrevive a uma resposta sem nota, sem níveis e sem opiniões", () => {
    const resultado = normalizarAvaliacoesItem({});

    expect(resultado).toEqual({
      ratingAverage: null,
      reviewsTotal: null,
      ratingLevels: null,
      opinioes: [],
    });
  });

  it("trata rating_average: 0 sem nenhuma opinião como sem nota, não nota zero", () => {
    // O Mercado Livre manda rating_average 0 (não omite o campo) para anúncio
    // sem opinião nenhuma — sem essa checagem, esse anúncio ficava
    // indistinguível de um anúncio com nota 0 de verdade, e o filtro "Com
    // avaliações" da tela deixava passar itens que não tinham avaliação.
    const resultado = normalizarAvaliacoesItem({
      rating_average: 0,
      paging: { total: 0 },
    });

    expect(resultado.ratingAverage).toBeNull();
    expect(resultado.reviewsTotal).toBe(0);
  });
});

describe("mensagens de reclamação do Mercado Livre", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("lista mensagens da reclamação, ordenadas da mais antiga para a mais nova", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([
      { sender_role: "respondent", receiver_role: "complainant", message: "Segunda", date_created: "2026-02-02T00:00:00Z", status: "available" },
      { sender_role: "complainant", receiver_role: "respondent", message: "Primeira", date_created: "2026-02-01T00:00:00Z", status: "available" },
      { sender_role: "respondent", receiver_role: "complainant", message: "", date_created: "2026-02-03T00:00:00Z", status: "available" },
    ]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new MercadoLivreProvider({
      clientId: "client", clientSecret: "secret", accessToken: "token", refreshToken: "refresh",
    });
    const mensagens = await provider.listarMensagensReclamacao("5204934310");

    expect(mensagens.map((m) => m.texto)).toEqual(["Primeira", "Segunda"]);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/post-purchase/v1/claims/5204934310/messages");
  });

  it("responde a quem reclamou quando a reclamação ainda não escalou", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("status 201 created", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new MercadoLivreProvider({
      clientId: "client", clientSecret: "secret", accessToken: "token", refreshToken: "refresh",
    });
    await provider.responderReclamacao("5204934310", "Vamos resolver.", "complainant");

    expect(String(fetchMock.mock.calls[0][0])).toContain("/post-purchase/v1/claims/5204934310/actions/send-message");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({
      receiver_role: "complainant",
      message: "Vamos resolver.",
      attachments: [],
    });
  });

  it("responde ao mediador quando a reclamação está em mediação", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("status 201 created", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new MercadoLivreProvider({
      clientId: "client", clientSecret: "secret", accessToken: "token", refreshToken: "refresh",
    });
    await provider.responderReclamacao("5204934310", "Envio comprovante.", "mediator");

    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({ receiver_role: "mediator" });
  });

  it("propaga erro da API ao responder reclamação", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("conversa bloqueada", { status: 409 }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new MercadoLivreProvider({
      clientId: "client", clientSecret: "secret", accessToken: "token", refreshToken: "refresh",
    });

    await expect(provider.responderReclamacao("5204934310", "Oi", "complainant")).rejects.toThrow(/409/);
  });
});
