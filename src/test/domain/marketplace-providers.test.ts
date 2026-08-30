import { afterEach, describe, expect, it, vi } from "vitest";
import { MercadoLivreProvider, normalizarAvaliacoesItem } from "@/modules/canais/infrastructure/mercadolivre.provider";
import { extrairIncomePorPedido, normalizarFinanceiroShopee, ShopeeProvider } from "@/modules/canais/infrastructure/shopee.provider";

describe("contratos dos providers de marketplace", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("normaliza pedidos do Mercado Livre e preserva SKU, quantidade e origem", async () => {
    // Relógio fixo logo depois do `desde`: a busca fatia o intervalo em
    // janelas de até 3 dias, e sem fixar o agora o teste pediria dezenas de
    // janelas conforme a data real fosse passando.
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-07-23T08:00:00.000Z").getTime());
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "seller-1" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        results: [{
          id: 123,
          status: "paid",
          total_amount: 49.9,
          shipping: { cost: 5 },
          buyer: { id: 9, nickname: "buyer" },
          order_items: [{
            item: { id: "MLB-1", variation_id: 12345, seller_sku: "SKU-1", title: "Varal Oval" },
            quantity: 2,
            unit_price: 24.95,
          }],
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
      // O anúncio vai junto do pedido: é o que permite casar a venda quando o
      // SKU já não existe mais no catálogo (anúncio pausado, excluído ou SKU
      // renomeado depois da venda).
      itens: [{
        skuExterno: "SKU-1",
        quantidade: 2,
        precoUnitario: "24.95",
        taxaMarketplace: undefined,
        listingId: "MLB-1",
        variationId: "12345",
        titulo: "Varal Oval",
      }],
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
      { partnerId: "9", partnerKey: "segredo-financeiro", shopId: "2", accessToken: "token-financeiro" },
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

  // Antes a listagem era uma chamada só, com page_size 50 e sem olhar
  // `more`/`next_cursor`: janela de 15 dias com mais de 50 pedidos perdia o
  // excedente calado, e pedido que não entra na sincronização não volta.
  it("segue o cursor do get_order_list até a Shopee dizer que acabou", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_784_780_000_000);
    const detalhe = (sn: string) => ({
      order_sn: sn,
      order_status: "READY_TO_SHIP",
      total_amount: 10,
      buyer_username: "comprador",
      create_time: 1_784_779_900,
      item_list: [{ item_id: 1, model_id: 0, item_sku: "SKU-1", model_quantity_purchased: 1, model_discounted_price: 10 }],
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        response: { order_list: [{ order_sn: "SHP-1" }, { order_sn: "SHP-2" }], more: true, next_cursor: "cursor-2" },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        response: { order_list: [{ order_sn: "SHP-3" }], more: false, next_cursor: "" },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        response: { order_list: ["SHP-1", "SHP-2", "SHP-3"].map(detalhe) },
      }), { status: 200 }))
      .mockResolvedValue(new Response(JSON.stringify({ response: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new ShopeeProvider(
      { partnerId: "1", partnerKey: "secret", shopId: "2", accessToken: "token" },
      { partnerId: "1", partnerKey: "secret", shopId: "2", accessToken: "token" },
      { partnerId: "9", partnerKey: "segredo-financeiro", shopId: "2", accessToken: "token-financeiro" },
    );
    const pedidos = await provider.buscarPedidos(new Date(1_784_780_000_000 - 3 * 24 * 60 * 60 * 1000));

    expect(pedidos.map((pedido) => pedido.providerOrderId)).toEqual(["SHP-1", "SHP-2", "SHP-3"]);
    // Primeira página sem cursor, segunda com o cursor que a Shopee devolveu.
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get("cursor")).toBeNull();
    expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.get("cursor")).toBe("cursor-2");
    // Terceira chamada é o detalhe, com os pedidos das duas páginas juntos.
    const urlDetalhe = new URL(String(fetchMock.mock.calls[2][0]));
    expect(urlDetalhe.pathname).toContain("get_order_detail");
    expect(urlDetalhe.searchParams.get("order_sn_list")).toBe("SHP-1,SHP-2,SHP-3");
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
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        // Forma REAL do get_escrow_detail_batch, conferida ao vivo contra a
        // conta WUWU em 28/08/2026: `response` é um ARRAY de objetos com
        // `escrow_detail` dentro — não existe `order_income_list` no lote.
        response: [
          {
            escrow_detail: {
              order_sn: "SHP-1",
              order_income: {
                buyer_total_amount: 24.2,
                buyer_paid_shipping_fee: 4.2,
                commission_fee: 2,
                service_fee: 1,
                seller_transaction_fee: 0.4,
                escrow_amount: 20.8,
              },
            },
          },
          {
            escrow_detail: {
              order_sn: "SHP-2",
              order_income: {
                buyer_total_amount: 35,
                buyer_paid_shipping_fee: 0,
                commission_fee: 3.5,
                escrow_amount: 31.5,
              },
            },
          },
        ],
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const creds = { partnerId: "1", partnerKey: "secret", shopId: "2", accessToken: "token" };
    // O escrow é assinado pelo app Financeiro (Accounting And Finance), não
    // pelo de Pedidos — par e token próprios, como na produção.
    const credsFinanceiro = { partnerId: "9", partnerKey: "segredo-financeiro", shopId: "2", accessToken: "token-financeiro" };
    const provider = new ShopeeProvider(creds, creds, credsFinanceiro);
    const pedidos = await provider.buscarPedidos(new Date("2026-07-20T05:00:00.000Z"));

    expect(pedidos.map((p) => p.itens.map((i) => i.skuExterno))).toEqual([
      ["shopee-111-222"],
      ["shopee-333", "VARIACAO"],
    ]);
    expect(pedidos[0]).toMatchObject({
      total: "24.20",
      frete: "4.20",
      valorLiquido: "20.80",
      itens: [expect.objectContaining({ taxaMarketplace: "3.40" })],
    });
  });

  it("normaliza e rateia em centavos o financeiro da Shopee", () => {
    const financeiro = normalizarFinanceiroShopee({
      buyer_total_amount: 50.1,
      buyer_paid_shipping_fee: 4.2,
      voucher_from_seller: 1,
      voucher_from_shopee: 2,
      coins: 0.5,
      buyer_transaction_fee: 0.25,
      commission_fee: 3.01,
      service_fee: 1,
      seller_transaction_fee: 0.5,
      order_ams_commission_fee: 0.99,
      escrow_amount: 42.35,
    }, [
      { model_quantity_purchased: 1, model_discounted_price: 30 },
      { model_quantity_purchased: 1, model_discounted_price: 15.9 },
    ]);

    expect(financeiro).toEqual({
      total: "50.10",
      frete: "4.20",
      desconto: "3.50",
      acrescimo: "0.25",
      valorLiquido: "42.35",
      taxasMarketplace: ["3.59", "1.91"],
    });
  });

  /** As duas primeiras respostas de qualquer volta de `buscarPedidos`:
   *  a lista de pedidos e o detalhe deles. O financeiro vem depois. */
  function respostasDePedidoShopee() {
    return [
      new Response(JSON.stringify({
        response: { order_list: [{ order_sn: "SHP-FALLBACK" }] },
      }), { status: 200 }),
      new Response(JSON.stringify({
        response: { order_list: [{
          order_sn: "SHP-FALLBACK",
          order_status: "READY_TO_SHIP",
          total_amount: 50.1,
          buyer_username: "comprador",
          create_time: 1_784_779_900,
          item_list: [{ item_id: 1, model_id: 0, item_sku: "SKU-1", model_quantity_purchased: 1, model_discounted_price: 45.9 }],
        }] },
      }), { status: 200 }),
    ];
  }

  it("usa o financeiro individual quando o lote falha por instabilidade", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_784_780_000_000);
    const [lista, detalhe] = respostasDePedidoShopee();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(lista)
      .mockResolvedValueOnce(detalhe)
      // Falha que NÃO é de permissão: um pedido do lote sem escrow liberado
      // ainda derruba a resposta inteira, e os demais têm o valor.
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: "error_param",
        message: "escrow not ready for one of the orders",
      }), { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        response: {
          order_sn: "SHP-FALLBACK",
          order_income: {
            buyer_total_amount: 50.1,
            buyer_paid_shipping_fee: 4.2,
            commission_fee: 5,
            escrow_amount: 45.1,
          },
        },
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const creds = { partnerId: "1", partnerKey: "secret", shopId: "2", accessToken: "token" };
    // O escrow é assinado pelo app Financeiro (Accounting And Finance), não
    // pelo de Pedidos — par e token próprios, como na produção.
    const credsFinanceiro = { partnerId: "9", partnerKey: "segredo-financeiro", shopId: "2", accessToken: "token-financeiro" };
    const pedidos = await new ShopeeProvider(creds, creds, credsFinanceiro)
      .buscarPedidos(new Date("2026-07-20T05:00:00.000Z"));

    expect(pedidos[0]).toMatchObject({
      frete: "4.20",
      valorLiquido: "45.10",
      itens: [expect.objectContaining({ taxaMarketplace: "5.00" })],
    });
    expect(String(fetchMock.mock.calls[3][0])).toContain("/payment/get_escrow_detail");
    expect(String(fetchMock.mock.calls[3][0])).toContain("order_sn=SHP-FALLBACK");
  });

  /* 403 de permissão vale para o app inteiro, não para aquele lote: insistir
     no endpoint individual multiplicava por 20 as chamadas condenadas e
     queimava a cota do proxy de IP fixo — 989 chamadas 403 em sete dias na
     conta real. O pedido entra sem financeiro, e a A34 preenche quando a
     Shopee liberar a categoria Payment. */
  it("não tenta o endpoint individual quando a Shopee nega permissão no lote", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_784_780_000_000);
    const [lista, detalhe] = respostasDePedidoShopee();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(lista)
      .mockResolvedValueOnce(detalhe)
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: "error_api_permission",
        message: "No permission to current api.",
      }), { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    const creds = { partnerId: "1", partnerKey: "secret", shopId: "2", accessToken: "token" };
    // O escrow é assinado pelo app Financeiro (Accounting And Finance), não
    // pelo de Pedidos — par e token próprios, como na produção.
    const credsFinanceiro = { partnerId: "9", partnerKey: "segredo-financeiro", shopId: "2", accessToken: "token-financeiro" };
    const pedidos = await new ShopeeProvider(creds, creds, credsFinanceiro)
      .buscarPedidos(new Date("2026-07-20T05:00:00.000Z"));

    // O pedido operacional continua chegando inteiro; só o financeiro falta.
    expect(pedidos[0]).toMatchObject({ providerOrderId: "SHP-FALLBACK", frete: undefined, valorLiquido: undefined });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

/* A API de Payment pertence à categoria Accounting And Finance, do app
     "Elisa Lima Financeiro" — NÃO à de Order Management. Assinado com o par
     do app de Pedidos, o escrow respondeu 403 error_api_permission em 989
     chamadas em sete dias, e todo pedido da Shopee entrou sem repasse. O
     par errado não quebra nada em tempo de compilação: só a URL denuncia. */
  it("assina o escrow com o app Financeiro e os pedidos com o app de Pedidos", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_784_780_000_000);
    const [lista, detalhe] = respostasDePedidoShopee();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(lista)
      .mockResolvedValueOnce(detalhe)
      .mockResolvedValueOnce(new Response(JSON.stringify({
        response: [{ escrow_detail: { order_sn: "SHP-FALLBACK", order_income: { escrow_amount: 45.1 } } }],
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const creds = { partnerId: "1", partnerKey: "secret", shopId: "2", accessToken: "token" };
    const credsFinanceiro = { partnerId: "9", partnerKey: "segredo-financeiro", shopId: "2", accessToken: "token-financeiro" };
    await new ShopeeProvider(creds, creds, credsFinanceiro)
      .buscarPedidos(new Date("2026-07-20T05:00:00.000Z"));

    const urlPedidos = new URL(String(fetchMock.mock.calls[1][0]));
    const urlEscrow = new URL(String(fetchMock.mock.calls[2][0]));
    expect(urlPedidos.pathname).toContain("get_order_detail");
    expect(urlPedidos.searchParams.get("partner_id")).toBe("1");
    expect(urlEscrow.pathname).toContain("get_escrow_detail_batch");
    expect(urlEscrow.searchParams.get("partner_id")).toBe("9");
    expect(urlEscrow.searchParams.get("access_token")).toBe("token-financeiro");
  });

  /* Marca que ainda não autorizou o app Financeiro. O pedido tem de entrar
     inteiro na mesma; o que não pode é gastar uma chamada por lote mais uma
     por pedido em algo condenado — a cota do proxy de IP fixo é o gargalo. */
  it("não chama o escrow quando a marca não tem o app Financeiro conectado", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_784_780_000_000);
    const [lista, detalhe] = respostasDePedidoShopee();
    const fetchMock = vi.fn().mockResolvedValueOnce(lista).mockResolvedValueOnce(detalhe);
    vi.stubGlobal("fetch", fetchMock);

    const creds = { partnerId: "1", partnerKey: "secret", shopId: "2", accessToken: "token" };
    const pedidos = await new ShopeeProvider(creds, creds).buscarPedidos(new Date("2026-07-20T05:00:00.000Z"));

    expect(pedidos[0]).toMatchObject({ providerOrderId: "SHP-FALLBACK", valorLiquido: undefined });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  /* O lote devolve `response` como ARRAY de escrow_detail. O código lia
     `response.order_income_list`, que é a forma do endpoint INDIVIDUAL —
     enquanto o escrow deu 403 isso ficou invisível, e no dia da liberação
     teria voltado 200 com financeiro vazio, sem erro nenhum pra investigar. */
  it("lê o financeiro do formato real do lote e ignora pedido sem income", () => {
    const doLote = extrairIncomePorPedido({
      response: [
        { escrow_detail: { order_sn: "A", order_income: { escrow_amount: 7.91 } } },
        { escrow_detail: { order_sn: "B" } },
      ],
    });
    expect([...doLote.keys()]).toEqual(["A"]);
    expect(doLote.get("A")).toMatchObject({ escrow_amount: 7.91 });

    // Tolera a forma antiga por segurança, sem depender dela.
    const antigo = extrairIncomePorPedido({
      response: { order_income_list: [{ order_sn: "C", order_income: { escrow_amount: 1 } }] },
    });
    expect([...antigo.keys()]).toEqual(["C"]);

    // Resposta de erro não vira financeiro em branco silencioso.
    expect(extrairIncomePorPedido({ error: "error_api_permission" }).size).toBe(0);
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
