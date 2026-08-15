import { afterEach, describe, expect, it, vi } from "vitest";
import { MercadoLivreAdsProvider, PublicidadeNaoHabilitadaError } from "@/modules/anuncios/infrastructure/mercadolivre-ads.provider";

/* Os paths e métricas testados aqui foram confirmados ao vivo contra as 3
 * contas reais do sistema (KARZI/WUWU/ARMARINHOS LIMA) em 15/08/2026 — não
 * são só o que a documentação descreve, é o que a API de fato aceita hoje.
 * Ver o comentário de topo de mercadolivre-ads.provider.ts para o porquê
 * disso importar (a primeira versão deste provider usava paths errados
 * tirados só de busca, e todos os 404 eram bug nosso, não falta de
 * permissão da conta). */

describe("provider de Product Ads do Mercado Livre", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("descobre o advertiser e usa Api-Version: 2 no header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      advertisers: [{ advertiser_id: 555, site_id: "MLB" }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new MercadoLivreAdsProvider("token-123", "karzi");
    const advertiser = await provider.obterAdvertiser();

    expect(advertiser).toEqual({ advertiserId: 555, siteId: "MLB" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/advertising/advertisers?product_id=PADS");
    expect((init as RequestInit).headers).toMatchObject({ "Api-Version": "2" });
  });

  it("trata 404 no endpoint de descoberta como conta sem Publicidade habilitada", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "No permissions found for user_id" }), { status: 404 }),
    ));

    const provider = new MercadoLivreAdsProvider("token-123", "wuwu");
    await expect(provider.obterAdvertiser()).rejects.toBeInstanceOf(PublicidadeNaoHabilitadaError);
  });

  it("lança PublicidadeNaoHabilitadaError quando a lista de advertisers vem vazia (200 sem dado)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ advertisers: [] }), { status: 200 }),
    ));

    const provider = new MercadoLivreAdsProvider("token-123", "karzi");
    // A API às vezes devolve sucesso vazio em vez de 404 — não dá pra
    // depender só do status HTTP para essa distinção.
    await expect(provider.obterAdvertiser()).rejects.toBeInstanceOf(PublicidadeNaoHabilitadaError);
  });

  it("um erro genérico (não 404) no advertiser não vira PublicidadeNaoHabilitadaError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("erro interno", { status: 500 })));

    const provider = new MercadoLivreAdsProvider("token-123", "karzi");
    await expect(provider.obterAdvertiser()).rejects.not.toBeInstanceOf(PublicidadeNaoHabilitadaError);
  });

  it("busca campanhas no path real confirmado (/marketplace/advertising/.../campaigns/search)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      results: [{
        id: 999,
        name: "Campanha Verão",
        status: "paused",
        strategy: "PROFITABILITY",
        budget: 100,
        currency_id: "BRL",
        roas_target: 4.5,
        acos_target: 22.2,
        channel: "marketplace",
        date_created: "2026-01-01T00:00:00.000Z",
        last_updated: "2026-08-14T00:00:00.000Z",
        metrics: {
          clicks: 120, prints: 4800, ctr: 0.025, cost: 340.5, cpc: 2.83,
          acos: 0.18, roas: 5.56, cvr: 0.031, sov: 0.12,
          organic_units_quantity: 8, direct_units_quantity: 14, indirect_units_quantity: 3,
          units_quantity: 25, direct_amount: 1200, indirect_amount: 300, total_amount: 1890,
        },
      }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new MercadoLivreAdsProvider("token-123", "karzi");
    const [campanha] = await provider.listarCampanhas(555, "MLB", new Date("2026-08-14"), new Date("2026-08-14"));

    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/marketplace/advertising/MLB/advertisers/555/product_ads/campaigns/search");
    // Métricas de exposição (impression_share etc.) nunca são pedidas —
    // confirmado ao vivo que a API rejeita a chamada inteira se pedir.
    expect(String(url)).not.toContain("impression_share");

    expect(campanha).toMatchObject({ id: 999, name: "Campanha Verão", strategy: "PROFITABILITY", roasTarget: 4.5, acosTarget: 22.2 });
    expect(campanha.metricas.roas).toBe(5.56);
  });

  it("busca anúncios no path real (ads/search, não items/search), sem filtrar por campanha", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      results: [{
        item_id: "MLB123", campaign_id: 999, ad_group_id: 4242,
        title: "Produto X", status: "active", price: 59.9,
        recommended: true, buy_box_winner: false, logistic_type: "xd_drop_off",
        domain_id: "MLB-CLEANING_CLOTHS", permalink: "https://...", thumbnail: "https://...",
        metrics: { clicks: 10, cost: 12.5 },
      }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new MercadoLivreAdsProvider("token-123", "karzi");
    const anuncios = await provider.listarAnuncios(555, "MLB", new Date("2026-08-14"), new Date("2026-08-14"));

    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/marketplace/advertising/MLB/advertisers/555/product_ads/ads/search");
    expect(String(url)).not.toContain("items/search");

    expect(anuncios).toEqual([expect.objectContaining({
      itemId: "MLB123", campaignId: 999, adGroupId: 4242, recommended: true,
    })]);
  });

  it("percorre todas as páginas de anúncios em vez de truncar nos primeiros 50", async () => {
    const primeiraPagina = Array.from({ length: 50 }, (_, indice) => ({
      item_id: `MLB${indice}`, campaign_id: 999, metrics: {},
    }));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        paging: { total: 51 }, results: primeiraPagina,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        paging: { total: 51 }, results: [{ item_id: "MLB50", campaign_id: 999, metrics: {} }],
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new MercadoLivreAdsProvider("token-123", "armarinhos_lima");
    const anuncios = await provider.listarAnuncios(555, "MLB", new Date("2026-08-14"), new Date("2026-08-14"));

    expect(anuncios).toHaveLength(51);
    expect(String(fetchMock.mock.calls[0][0])).toContain("offset=0");
    expect(String(fetchMock.mock.calls[1][0])).toContain("offset=50");
  });

  it("consulta histórico diário e métricas de exposição no endpoint individual", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [{
      date: "2026-08-14", clicks: 12, impression_share: 0.42,
      lost_impression_share_by_budget: 0.18, acos_benchmark: 0.21,
    }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new MercadoLivreAdsProvider("token-123", "karzi");
    const [ponto] = await provider.listarMetricasDiariasCampanha("MLB", 999, new Date("2026-08-01"), new Date("2026-08-14"));

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("/advertising/MLB/product_ads/campaigns/999");
    expect(url).toContain("aggregation_type=DAILY");
    expect(url).toContain("impression_share");
    expect(ponto).toEqual(expect.objectContaining({ data: "2026-08-14", metricas: expect.objectContaining({ impression_share: 0.42 }) }));
  });
});
