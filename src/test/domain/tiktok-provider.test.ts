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

  it("resume o faturamento oficial separando cancelados", async () => {
    const orders = [
      { id: "pago", status: "DELIVERED", payment: { total_amount: "20.00" }, buyer_uid: "1", create_time: 1_719_999_000, line_items: [] },
      { id: "cancelado", status: "CANCELLED", payment: { total_amount: "5.00" }, buyer_uid: "2", create_time: 1_719_999_100, line_items: [] },
      { id: "nao-pago", status: "UNPAID", payment: { total_amount: "99.00" }, buyer_uid: "3", create_time: 1_719_999_200, line_items: [] },
    ];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: { orders } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: { orders } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new TikTokShopProvider({
      appKey: "app-key", appSecret: "secret", accessToken: "access-token", shopCipher: "shop-cipher",
    });

    await expect(provider.resumirFaturamentoOficial(
      new Date("2024-07-03T00:00:00Z"),
      new Date("2024-07-04T00:00:00Z"),
    )).resolves.toEqual({
      faturamento: 20,
      pedidosValidos: 1,
      canceladosValor: 5,
      canceladosQtd: 1,
      totalBruto: 25,
      totalPedidos: 3,
    });
  });

  it("consulta estoque pelo ID interno mesmo depois de renomear o seller_sku", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      code: 0,
      data: {
        skus: [
          { id: "sku-interno-1", seller_sku: "NOVO-1", inventory: [{ quantity: 3 }] },
          { id: "sku-interno-2", seller_sku: "NOVO-2", inventory: [{ quantity: 7 }] },
        ],
      },
    })));
    const provider = new TikTokShopProvider({
      appKey: "app-key", appSecret: "secret", accessToken: "access-token", shopCipher: "shop-cipher",
    });

    await expect(provider.consultarEstoque({
      listingId: "listing-1",
      skuId: "SKU-ANTIGO",
      warehouseId: "sku-interno-2",
    })).resolves.toBe(7);
  });

  it("não soma variações quando o vínculo não identifica um SKU", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      code: 0,
      data: {
        skus: [
          { id: "sku-interno-1", inventory: [{ quantity: 3 }] },
          { id: "sku-interno-2", inventory: [{ quantity: 7 }] },
        ],
      },
    })));
    const provider = new TikTokShopProvider({
      appKey: "app-key", appSecret: "secret", accessToken: "access-token", shopCipher: "shop-cipher",
    });

    await expect(provider.consultarEstoque({ listingId: "listing-1" }))
      .rejects.toThrow(/varia[cç][aã]o inequ[ií]voca/i);
  });

  it("agrupa linhas repetidas por unidade em quantidade, usando o preço cheio", async () => {
    // O TikTok não manda `quantity`: repete a linha por unidade, com o mesmo
    // sku_id — confirmado com pedidos reais das três marcas em 03/09/2026
    // (ex.: pedido 585872424607319127 da WUWU). `original_price`, não
    // `sale_price`, porque ESPEC_CANAL.tiktokshop reconstrói o bruto com o
    // desconto contado à parte.
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      code: 0,
      data: { orders: [{
        id: "order-2x",
        status: "AWAITING_SHIPMENT",
        payment: { total_amount: "58.10", shipping_fee: "0", platform_discount: "3.70" },
        user_id: "user-1",
        create_time: 1_719_999_000,
        line_items: [
          { seller_sku: "K545", sku_id: "sku-1", sale_price: "29.05", original_price: "29.90" },
          { seller_sku: "K545", sku_id: "sku-1", sale_price: "29.05", original_price: "29.90" },
        ],
      }] },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new TikTokShopProvider({
      appKey: "app-key", appSecret: "secret", accessToken: "access-token", shopCipher: "shop-cipher",
    });
    const [pedido] = await provider.buscarPedidos(new Date("2024-07-03T00:00:00Z"));

    expect(pedido.itens).toEqual([{
      skuExterno: "K545",
      quantidade: 2,
      precoUnitario: "29.90",
      listingId: undefined,
      variationId: "sku-1",
      titulo: undefined,
    }]);
    expect(pedido.clienteExternalId).toBe("user-1");
    expect(pedido.desconto).toBe("3.70");
  });

  it("nome de destinatário vazio vira o rótulo padrão, não string vazia", async () => {
    // Pedido cancelado antes do pagamento vem com `name: ""` — string vazia,
    // não ausente. Com `??` isso passava batido e a ingestão recusava o pedido
    // inteiro ("clienteNome: expected string to have >=1 characters"): 235 dos
    // 1457 pedidos das três marcas, numa importação real de 03/09/2026.
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      code: 0,
      data: { orders: [{
        id: "order-sem-nome",
        status: "CANCELLED",
        payment: { total_amount: "19.90" },
        user_id: "user-9",
        recipient_address: { name: "   " },
        create_time: 1_719_999_000,
        line_items: [{ seller_sku: "X1", sku_id: "s1", sale_price: "19.90", original_price: "19.90" }],
      }] },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new TikTokShopProvider({
      appKey: "app-key", appSecret: "secret", accessToken: "access-token", shopCipher: "shop-cipher",
    });
    const [pedido] = await provider.buscarPedidos(new Date("2024-07-03T00:00:00Z"));
    expect(pedido.clienteNome).toBe("Cliente TikTok Shop");
  });

  it("fatia a busca em janelas de 7 dias", () => {
    const provider = new TikTokShopProvider({
      appKey: "app-key", appSecret: "secret", accessToken: "access-token", shopCipher: "shop-cipher",
    });
    const janelas = provider.janelasDePedidos(
      new Date("2026-06-05T00:00:00Z"),
      new Date("2026-09-03T00:00:00Z"),
    );
    // 90 dias em janelas de 7 = 13 janelas (a última mais curta), contíguas e
    // sem buraco. Sem isto o A31 varreria os 90 dias num step só.
    expect(janelas).toHaveLength(13);
    expect(janelas[0].inicioMs).toBe(Date.parse("2026-06-05T00:00:00Z"));
    expect(janelas.at(-1)!.fimMs).toBe(Date.parse("2026-09-03T00:00:00Z"));
    for (let i = 1; i < janelas.length; i++) {
      expect(janelas[i].inicioMs).toBe(janelas[i - 1].fimMs);
    }
  });

  it("filtrarPendentes evita o detalhe do que já está gravado", async () => {
    // A janela de contingência revisita as mesmas horas várias vezes por dia.
    // Sem o filtro, o detalhe de todo pedido já gravado era relido a cada
    // passagem — cota do proxy gasta para reescrever o que já estava lá.
    const fetchMock = vi.fn(async (input: string | URL) => {
      const path = new URL(input).pathname;
      if (path.endsWith("/orders/search")) {
        return new Response(JSON.stringify({
          code: 0,
          data: { orders: [
            { id: "ja-gravado", status: "COMPLETED", create_time: 1 },
            { id: "pendente", status: "AWAITING_SHIPMENT", create_time: 2 },
          ], total_count: 2 },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        code: 0,
        data: { orders: [{
          id: "pendente", status: "AWAITING_SHIPMENT", payment: { total_amount: "5.00" },
          user_id: "u", recipient_address: { name: "N" }, create_time: 2,
          line_items: [{ seller_sku: "S", sku_id: "s", sale_price: "5.00", original_price: "5.00" }],
        }] },
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new TikTokShopProvider({
      appKey: "app-key", appSecret: "secret", accessToken: "access-token", shopCipher: "shop-cipher",
    });
    const vistos: string[] = [];
    const pedidos = await provider.buscarPedidosDaJanela(0, 1_000, {
      filtrarPendentes: async (candidatos) => {
        vistos.push(...candidatos.map((c) => `${c.providerOrderId}:${c.statusExterno}`));
        return ["pendente"];
      },
    });

    // O filtro recebeu os dois candidatos COM o status externo da listagem…
    expect(vistos).toEqual(["ja-gravado:COMPLETED", "pendente:AWAITING_SHIPMENT"]);
    // …e só o pendente virou chamada de detalhe.
    expect(pedidos.map((p) => p.providerOrderId)).toEqual(["pendente"]);
    const detalhes = fetchMock.mock.calls.filter(([i]) => !new URL(i as string).pathname.endsWith("/orders/search"));
    expect(detalhes).toHaveLength(1);
    expect(new URL(detalhes[0][0] as string).searchParams.get("ids")).toBe("pendente");
  });

  it("janela sem pedido nenhum não derruba a coleta", async () => {
    // Resposta real de janela vazia: sem a chave `orders`, só total_count 0.
    // Exigir o array aqui fazia uma semana parada derrubar os 90 dias.
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      code: 0, data: { next_page_token: "", total_count: 0 },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new TikTokShopProvider({
      appKey: "app-key", appSecret: "secret", accessToken: "access-token", shopCipher: "shop-cipher",
    });
    await expect(provider.buscarPedidosDaJanela(0, 1_000)).resolves.toEqual([]);
    // Nenhuma chamada de detalhe para uma janela vazia.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("descarta telefone mascarado e preserva telefone real", async () => {
    // A máscara do TikTok colide entre compradores distintos (182 casos em
    // 1418 pedidos reais da WUWU), e `cliente` tem índice único por telefone:
    // gravar a máscara ou recusa o pedido ou funde compradores diferentes.
    const responder = (phone: string) => new Response(JSON.stringify({
      code: 0,
      data: { orders: [{
        id: "o1", status: "COMPLETED", payment: { total_amount: "10.00" },
        user_id: "u1", recipient_address: { name: "Fulano", phone_number: phone },
        create_time: 1_719_999_000,
        line_items: [{ seller_sku: "S", sku_id: "s", sale_price: "10.00", original_price: "10.00" }],
      }] },
    }), { status: 200, headers: { "Content-Type": "application/json" } });

    const provider = new TikTokShopProvider({
      appKey: "app-key", appSecret: "secret", accessToken: "access-token", shopCipher: "shop-cipher",
    });

    vi.stubGlobal("fetch", vi.fn(async () => responder("(+55)119******45")));
    expect((await provider.buscarPedidos(new Date("2024-07-03T00:00:00Z")))[0].clienteTelefone).toBeUndefined();

    // Vazio também precisa virar undefined: `cliente` tem índice único por
    // telefone, então todo cliente sem telefone colidiria no mesmo "" — foram
    // 183 pedidos recusados como "cliente_duplicado" sem nenhum ser duplicata.
    vi.stubGlobal("fetch", vi.fn(async () => responder("")));
    expect((await provider.buscarPedidos(new Date("2024-07-03T00:00:00Z")))[0].clienteTelefone).toBeUndefined();

    vi.stubGlobal("fetch", vi.fn(async () => responder("(+55)11987654321")));
    expect((await provider.buscarPedidos(new Date("2024-07-03T00:00:00Z")))[0].clienteTelefone).toBe("(+55)11987654321");
  });

  it("sincronizarEstoque resolve o id interno do SKU e o armazém padrão antes de escrever", async () => {
    const chamadas: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL) => {
      const path = new URL(input).pathname;
      chamadas.push(path);
      if (path.endsWith("/inventory/update")) {
        return new Response(JSON.stringify({ code: 0, data: {} }), { status: 200 });
      }
      if (path.includes("/logistics/")) {
        return new Response(JSON.stringify({
          code: 0,
          data: { warehouses: [
            { id: "wh-return", is_default: false },
            { id: "wh-vendas", is_default: true },
          ] },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        code: 0,
        data: { skus: [{ id: "sku-interno-1", seller_sku: "K545" }, { id: "sku-interno-2", seller_sku: "K550" }] },
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new TikTokShopProvider({
      appKey: "app-key", appSecret: "secret", accessToken: "access-token", shopCipher: "shop-cipher",
    });
    await provider.sincronizarEstoque({ listingId: "listing-1", skuId: "K545" }, 7);

    const feitas = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const chamadaUpdate = feitas.find(([input]) => new URL(input).pathname.endsWith("/inventory/update"));
    const corpo = JSON.parse(chamadaUpdate![1].body as string);
    // `id` é o interno resolvido pelo seller_sku "K545" (sku-interno-1, não
    // sku-interno-2), e o armazém é o marcado is_default — nem o único
    // referencia.skuId "K545" nem nenhum warehouseId foram usados direto.
    expect(corpo).toEqual({ skus: [{ id: "sku-interno-1", inventory: [{ warehouse_id: "wh-vendas", quantity: 7 }] }] });
  });
});
