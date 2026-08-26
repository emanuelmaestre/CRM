import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const shopeeFetchMock = vi.fn();
vi.mock("@/shared/lib/shopee-proxy", () => ({ shopeeFetch: (...args: unknown[]) => shopeeFetchMock(...args) }));

import {
  dataShopeeAdsParaIso,
  janelasDeDias,
  paraDataShopeeAds,
  PublicidadeShopeeNaoHabilitadaError,
  ShopeeAdsProvider,
} from "@/modules/anuncios/infrastructure/shopee-ads.provider";
import { deveAtribuirMetricasAoItem } from "@/modules/anuncios/application/sincronizacao-shopee.service";

/* ATENÇÃO: diferente do teste do provider do Mercado Livre, NADA aqui foi
   confirmado ao vivo contra a loja real — o app "Elisa Lima Anuncios" saiu do
   Go Live em 26/08/2026 e a primeira autorização ainda não tinha acontecido
   quando isto foi escrito. Estes testes cobrem o que é nosso (assinatura,
   fatiamento de janela, formato de data, tratamento de erro), não o contrato
   da Shopee. O contrato se confirma com `npm run anuncios:shopee:inspecionar`.
   Ver o aviso no topo de shopee-ads.provider.ts. */

function respostaOk(corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), { status: 200 });
}

const CREDS = {
  partnerId: "999999",
  partnerKey: "chave-do-app-de-anuncios",
  shopId: "1234567",
  accessToken: "token-de-anuncios",
};

describe("formato de data dos relatórios de Ads da Shopee", () => {
  it("escreve DD-MM-YYYY, não ISO", () => {
    expect(paraDataShopeeAds(new Date(2026, 7, 26))).toBe("26-08-2026");
    expect(paraDataShopeeAds(new Date(2026, 0, 5))).toBe("05-01-2026");
  });

  it("volta pro ISO que a coluna `data` do snapshot usa", () => {
    expect(dataShopeeAdsParaIso("26-08-2026")).toBe("2026-08-26");
  });

  /* Sem data não dá pra saber a que dia a métrica pertence, e gravar no dia de
     hoje falsificaria a série histórica — por isso null, e não um palpite. */
  it("devolve null para o que não reconhece", () => {
    expect(dataShopeeAdsParaIso("2026-08-26")).toBeNull();
    expect(dataShopeeAdsParaIso(undefined)).toBeNull();
    expect(dataShopeeAdsParaIso("")).toBeNull();
  });
});

describe("fatiamento da janela de relatório", () => {
  it("cobre o intervalo inteiro sem buraco nem sobreposição", () => {
    const inicio = new Date(2026, 7, 1);
    const fim = new Date(2026, 7, 20);
    const janelas = janelasDeDias(inicio, fim, 15);

    expect(janelas[0].inicio.getTime()).toBe(inicio.getTime());
    expect(janelas[janelas.length - 1].fim.getTime()).toBe(fim.getTime());
    for (let i = 1; i < janelas.length; i += 1) {
      const distancia = janelas[i].inicio.getTime() - janelas[i - 1].fim.getTime();
      expect(distancia).toBe(24 * 60 * 60 * 1000);
    }
  });

  it("nunca passa do teto de dias por chamada", () => {
    const janelas = janelasDeDias(new Date(2026, 5, 1), new Date(2026, 7, 29), 15);
    for (const janela of janelas) {
      const dias = (janela.fim.getTime() - janela.inicio.getTime()) / (24 * 60 * 60 * 1000) + 1;
      expect(dias).toBeLessThanOrEqual(15);
    }
  });

  it("um dia só vira uma janela só", () => {
    const dia = new Date(2026, 7, 26);
    expect(janelasDeDias(dia, dia, 15)).toHaveLength(1);
  });
});

describe("provider de Product Ads da Shopee", () => {
  beforeEach(() => { shopeeFetchMock.mockReset(); });
  afterEach(() => { vi.restoreAllMocks(); });

  /* Assinar só o sufixo do caminho (sem /api/v2) devolve "Wrong sign" — erro
     silencioso que já custou caro neste projeto, ver shopee.provider.ts. */
  it("assina o caminho completo, com /api/v2, e manda os cinco parâmetros de autenticação", async () => {
    shopeeFetchMock.mockResolvedValue(respostaOk({ response: { total_balance: 42.5 } }));

    const provider = new ShopeeAdsProvider(CREDS);
    await provider.obterSaldo();

    const url = new URL(String(shopeeFetchMock.mock.calls[0][0]));
    expect(url.pathname).toBe("/api/v2/ads/get_total_balance");
    expect(url.searchParams.get("partner_id")).toBe(CREDS.partnerId);
    expect(url.searchParams.get("shop_id")).toBe(CREDS.shopId);
    expect(url.searchParams.get("access_token")).toBe(CREDS.accessToken);

    const timestamp = url.searchParams.get("timestamp")!;
    const { createHmac } = await import("crypto");
    const esperada = createHmac("sha256", CREDS.partnerKey)
      .update(`${CREDS.partnerId}/api/v2/ads/get_total_balance${timestamp}${CREDS.accessToken}${CREDS.shopId}`)
      .digest("hex");
    expect(url.searchParams.get("sign")).toBe(esperada);
  });

  it("pagina a lista de campanhas até has_next_page dizer que acabou", async () => {
    shopeeFetchMock
      .mockResolvedValueOnce(respostaOk({ response: {
        campaign_list: [{ campaign_id: 1, ad_type: "auto" }, { campaign_id: 2, ad_type: "manual" }],
        has_next_page: true,
      } }))
      .mockResolvedValueOnce(respostaOk({ response: {
        campaign_list: [{ campaign_id: 3, ad_type: "auto" }],
        has_next_page: false,
      } }));

    const campanhas = await new ShopeeAdsProvider(CREDS).listarCampanhas();

    expect(campanhas.map((c) => c.campaignId)).toEqual(["1", "2", "3"]);
    expect(new URL(String(shopeeFetchMock.mock.calls[1][0])).searchParams.get("offset")).toBe("2");
  });

  /* A Shopee devolve erro de negócio com HTTP 200 e um campo `error` — ler só
     o status esconderia a falha. */
  it("transforma erro de permissão em PublicidadeShopeeNaoHabilitadaError", async () => {
    shopeeFetchMock.mockResolvedValue(respostaOk({
      error: "error_api_permission",
      message: "This app type has no permission to this API",
    }));

    await expect(new ShopeeAdsProvider(CREDS).listarCampanhas())
      .rejects.toBeInstanceOf(PublicidadeShopeeNaoHabilitadaError);
  });

  it("deixa passar como erro comum o que não é falta de Ads na loja", async () => {
    shopeeFetchMock.mockResolvedValue(respostaOk({ error: "error_param", message: "invalid campaign_id_list" }));

    const promessa = new ShopeeAdsProvider(CREDS).listarCampanhas();
    await expect(promessa).rejects.toThrow(/invalid campaign_id_list/);
    await expect(promessa).rejects.not.toBeInstanceOf(PublicidadeShopeeNaoHabilitadaError);
  });

  it("achata loja → campanha → dia na série diária por campanha", async () => {
    shopeeFetchMock.mockResolvedValue(respostaOk({ response: [{
      shop_id: 1234567,
      campaign_list: [{
        campaign_id: 99,
        ad_name: "Campanha de teste",
        campaign_placement: "search",
        metrics_list: [
          { date: "25-08-2026", clicks: 10, impression: 100, expense: 5 },
          { date: "26-08-2026", clicks: 12, impression: 130, expense: 6 },
        ],
      }],
    }] }));

    const desempenho = await new ShopeeAdsProvider(CREDS)
      .listarDesempenhoDiario(["99"], new Date(2026, 7, 25), new Date(2026, 7, 26));

    expect(desempenho).toHaveLength(1);
    expect(desempenho[0].nome).toBe("Campanha de teste");
    expect(desempenho[0].dias.map((dia) => dia.date)).toEqual(["25-08-2026", "26-08-2026"]);
  });
});

/* Não existe endpoint de desempenho por item na Shopee. Repetir a métrica da
   campanha em cada item multiplicaria o investimento pelo número de itens —
   é melhor gravar o vínculo sem métrica do que um número inflado. */
describe("atribuição de métrica de campanha ao item", () => {
  it("atribui quando a campanha anuncia um item só", () => {
    expect(deveAtribuirMetricasAoItem(["123"])).toBe(true);
  });

  it("não atribui quando há mais de um item", () => {
    expect(deveAtribuirMetricasAoItem(["123", "456"])).toBe(false);
  });

  it("não atribui quando a campanha não declara item nenhum", () => {
    expect(deveAtribuirMetricasAoItem([])).toBe(false);
  });
});
