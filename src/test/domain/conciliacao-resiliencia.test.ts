import { afterEach, describe, expect, it, vi } from "vitest";
import { inicioColetaPedidos, podeAvancarCoberturaPedidos } from "@/modules/canais/domain/cobertura-pedidos";
import {
  ehErroComPedidoIgnoradoRegistrado,
  ErroSkuSemProduto,
  marcarErroComPedidoIgnoradoRegistrado,
} from "@/modules/canais/domain/errors";
import { selecionarModelosShopee } from "@/modules/canais/domain/modelo-estoque-shopee";
import { podeAplicarVersaoPedido } from "@/modules/canais/domain/versao-pedido";
import { MercadoLivreProvider, normalizarPedidoMercadoLivre } from "@/modules/canais/infrastructure/mercadolivre.provider";
import { ShopeeProvider } from "@/modules/canais/infrastructure/shopee.provider";
import { TikTokShopProvider } from "@/modules/canais/infrastructure/tiktokshop.provider";
import {
  reembolsoParcialInformado,
  valorFaturavelPedido,
} from "@/modules/vendas/domain/status-faturamento";

const proxy = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/shopee-proxy", () => ({ shopeeFetch: proxy }));
const ok = (data: unknown) => new Response(JSON.stringify(data));
const inicio = new Date("2026-08-29T00:00:00Z");
const fim = new Date("2026-08-30T00:00:00Z");
const ml = { clientId: "c", clientSecret: "s", accessToken: "t", refreshToken: "r" };
const shopee = { partnerId: "1", partnerKey: "k", shopId: "9", accessToken: "t" };
const tiktok = { appKey: "k", appSecret: "s", accessToken: "t", shopCipher: "c" };

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); proxy.mockReset(); });

describe("cobertura e versões", () => {
  it("retoma vários dias de falha, além da janela normal", () => {
    expect(inicioColetaPedidos(fim.getTime(), "2026-08-20T12:00:00Z", 7 * 3600000).toISOString()).toBe("2026-08-20T11:00:00.000Z");
  });
  it("não aceita marcador futuro ou inválido como cobertura", () => {
    for (const valor of [null, "inválido", "2027-01-01"]) {
      expect(inicioColetaPedidos(fim.getTime(), valor, 7 * 3600000).toISOString()).toBe("2026-08-29T17:00:00.000Z");
    }
  });
  it("só avança a cobertura quando toda recusa tem registro durável", () => {
    expect(podeAvancarCoberturaPedidos(0)).toBe(true);
    expect(podeAvancarCoberturaPedidos(1)).toBe(false);
  });
  it("marca o erro sem perder seu tipo e os SKUs", () => {
    const erro = new ErroSkuSemProduto(["SKU-1"]);
    const marcado = marcarErroComPedidoIgnoradoRegistrado(erro);
    expect(marcado).toBe(erro);
    expect(marcado).toBeInstanceOf(ErroSkuSemProduto);
    expect(ehErroComPedidoIgnoradoRegistrado(marcado)).toBe(true);
    expect(ehErroComPedidoIgnoradoRegistrado(new Error("sem fila"))).toBe(false);
  });
  it("não reverte financeiro com evento antigo ou sem versão", () => {
    expect(podeAplicarVersaoPedido(fim, inicio)).toBe(false);
    expect(podeAplicarVersaoPedido(fim)).toBe(false);
    expect(podeAplicarVersaoPedido(fim, fim)).toBe(true);
    expect(podeAplicarVersaoPedido(inicio, fim)).toBe(true);
  });
});

describe("variações Shopee", () => {
  const modelos = [{ model_id: 11, model_sku: "KIT_A" }, { model_id: 22, model_sku: "KIT_B" }];
  it("usa ID da variação mesmo se o SKU foi renomeado", () => {
    expect(selecionarModelosShopee(modelos, { listingId: "1", skuId: "SKU_ANTIGO", warehouseId: "22" })).toEqual([modelos[1]]);
  });
  it("não confunde SKU numérico do vendedor com ID de variação", () => {
    expect(() => selecionarModelosShopee(modelos, { listingId: "1", skuId: "22" })).toThrow(/inequívoca/);
  });
  it("não soma variações sem vínculo; aceita SKU literal inequívoco", () => {
    expect(() => selecionarModelosShopee(modelos, { listingId: "1" })).toThrow();
    expect(selecionarModelosShopee(modelos, { listingId: "1", skuId: "KIT_A" })).toEqual([modelos[0]]);
  });
  it("consulta saldo no item base quando anúncio comprovadamente não tem variações", async () => {
    proxy.mockResolvedValueOnce(ok({ response: { model: [] } }))
      .mockResolvedValueOnce(ok({ response: { item_list: [{ item_id: 1, has_model: false, stock_info_v2: { summary_info: { total_available_stock: 17 } } }] } }));
    expect(await new ShopeeProvider(shopee).consultarEstoque({ listingId: "1", skuId: "SKU_PAI" })).toBe(17);
  });
  it("não usa saldo agregado quando as variações estão ausentes por erro", async () => {
    proxy.mockResolvedValueOnce(ok({ response: { model: [] } }))
      .mockResolvedValueOnce(ok({ response: { item_list: [{ item_id: 1, has_model: true, stock_info_v2: { summary_info: { total_available_stock: 17 } } }] } }));
    await expect(new ShopeeProvider(shopee).consultarEstoque({ listingId: "1" })).rejects.toThrow(/confirmar/);
  });
});

describe("paginação não pode produzir falso sucesso", () => {
  it("ML recusa páginas repetidas mesmo atingindo o total bruto", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("/users/me") ? ok({ id: "1" }) : ok({
      results: Array.from({ length: 50 }, () => ({ id: 1 })), paging: { total: 100 },
    })));
    await expect(new MercadoLivreProvider(ml).buscarPedidosDaJanela(inicio.getTime(), fim.getTime())).rejects.toThrow(/paginação instável/);
  });
  it("ML consulta alterações dentro de intervalo fixo", async () => {
    const fetcher = vi.fn(async (url: string) => url.includes("/users/me") ? ok({ id: "1" }) : ok({ results: [], paging: { total: 0 } }));
    vi.stubGlobal("fetch", fetcher);
    await new MercadoLivreProvider(ml).buscarPedidos(inicio, { campoData: "atualizacao", ate: fim });
    const url = new URL(String(fetcher.mock.calls[1][0]));
    expect(url.searchParams.get("order.date_last_updated.from")).toBe(inicio.toISOString());
    expect(url.searchParams.get("order.date_last_updated.to")).toBe(fim.toISOString());
    expect(url.searchParams.has("order.date_created.from")).toBe(false);
  });
  it("Shopee não encerra coleta com more=true e cursor repetido", async () => {
    proxy.mockImplementation(async () => ok({ response: { order_list: [{ order_sn: "1", order_status: "COMPLETED" }], more: true, next_cursor: "x" } }));
    await expect(new ShopeeProvider(shopee, shopee).buscarPedidos(inicio, { ate: fim })).rejects.toThrow(/cursor/);
  });
  it("avaliações Shopee não viram zero quando falta o envelope", async () => {
    proxy.mockResolvedValue(ok({}));
    await expect(new ShopeeProvider(shopee).listarAvaliacoes()).rejects.toThrow();
  });
  it("TikTok lê todas as páginas e busca detalhes que a lista não contém", async () => {
    proxy.mockImplementation(async (entrada: string) => {
      const url = new URL(entrada);
      if (url.pathname.endsWith("/search")) return ok({ code: 0, data: { orders: [{ id: url.searchParams.has("page_token") ? "2" : "1" }], total_count: 2, next_page_token: url.searchParams.has("page_token") ? "" : "next" } });
      return ok({ code: 0, data: { orders: ["1", "2"].map((id) => ({ id, status: "COMPLETED", payment: { total_amount: "10.00" }, create_time: inicio.getTime() / 1000, line_items: [{ seller_sku: "X", quantity: 1, sale_price: "10.00" }] })) } });
    });
    const pedidos = await new TikTokShopProvider(tiktok).buscarPedidos(inicio, { campoData: "atualizacao", ate: fim });
    expect(pedidos.map((p) => p.providerOrderId)).toEqual(["1", "2"]);
    expect(pedidos.every((p) => p.total === "10.00" && p.itens.length === 1)).toBe(true);
    expect(JSON.parse(proxy.mock.calls[0][1].body)).toEqual({ update_time_ge: inicio.getTime() / 1000, update_time_lt: fim.getTime() / 1000 });
  });
});

it("preserva reembolso parcial, cria referência sem SKU e multiplica tarifa por quantidade", () => {
  const pedido = normalizarPedidoMercadoLivre({ id: 1, status: "partially_refunded", total_amount: 30,
    buyer: { id: 2, nickname: "comprador" }, date_created: inicio.toISOString(), date_last_updated: fim.toISOString(),
    payments: [{ id: 3, status: "approved", transaction_amount_refunded: 10 }],
    order_items: [{ item: { id: "MLB1", variation_id: 20, title: "Produto" }, quantity: 3, unit_price: 10, sale_fee: 2.35 }],
  });
  expect(pedido.total).toBe("30");
  expect(pedido.itens[0].taxaMarketplace).toBe("7.05");
  expect(pedido.itens[0].skuExterno).toBe("MLB1-20");
  expect(pedido.atualizadoOrigemEm).toEqual(fim);
  expect(pedido.dadosOrigem?.pagamentos).toEqual([expect.objectContaining({ reembolsado: 10 })]);
  expect(reembolsoParcialInformado(pedido.dadosOrigem)).toBe(10);
  expect(valorFaturavelPedido(pedido.total, pedido.dadosOrigem)).toBe(20);
});

it("não transforma dado ausente, nulo ou malformado em pedido zerado", () => {
  expect(valorFaturavelPedido("30", undefined)).toBe(30);
  expect(valorFaturavelPedido("30", { pagamentos: null })).toBe(30);
  expect(valorFaturavelPedido("30", { pagamentos: [{ reembolsado: null }, { reembolsado: "10" }] })).toBe(30);
  expect(valorFaturavelPedido("30", { pagamentos: [{ reembolsado: 50 }] })).toBe(0);
});
