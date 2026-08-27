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
import {
  converterFracaoShopeeParaPercentual,
  deveAtribuirMetricasAoItem,
} from "@/modules/anuncios/application/sincronizacao-shopee.service";

/* Os formatos testados aqui foram confirmados ao vivo em 26/08/2026 contra a
   loja WUWU (shop_id 1645247022) — o payload dos testes de envelope e escala é
   cópia do que a API devolveu de verdade, não do que a documentação descrevia.
   Dois casos aqui existem porque a versão anterior errou os dois em silêncio:
   o envelope objeto-vs-array e a escala fração-vs-percentual. */

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

  /* Formato real: `response` é OBJETO, não array de blocos por loja. A versão
     anterior tipava como array e quebrou com "is not iterable" na primeira
     chamada de verdade. */
  it("achata loja → campanha → dia quando o envelope é objeto", async () => {
    shopeeFetchMock.mockResolvedValue(respostaOk({ response: {
      shop_id: 1645247022,
      region: "BR",
      campaign_list: [{
        campaign_id: 107287398,
        ad_type: "manual",
        campaign_placement: "all",
        ad_name: "Cortina Box Preta",
        metrics_list: [
          { date: "25-08-2026", clicks: 40, impression: 1813, expense: 10 },
          { date: "26-08-2026", clicks: 24, impression: 1079, expense: 10 },
        ],
      }],
    } }));

    const desempenho = await new ShopeeAdsProvider(CREDS)
      .listarDesempenhoDiario(["107287398"], new Date(2026, 7, 25), new Date(2026, 7, 26));

    expect(desempenho).toHaveLength(1);
    expect(desempenho[0].campaignId).toBe("107287398");
    expect(desempenho[0].nome).toBe("Cortina Box Preta");
    expect(desempenho[0].dias.map((dia) => dia.date)).toEqual(["25-08-2026", "26-08-2026"]);
  });

  it("continua entendendo o envelope em array, caso outra região devolva assim", async () => {
    shopeeFetchMock.mockResolvedValue(respostaOk({ response: [{
      shop_id: 1645247022,
      campaign_list: [{ campaign_id: 99, metrics_list: [{ date: "26-08-2026", clicks: 1 }] }],
    }] }));

    const desempenho = await new ShopeeAdsProvider(CREDS)
      .listarDesempenhoDiario(["99"], new Date(2026, 7, 26), new Date(2026, 7, 26));

    expect(desempenho).toHaveLength(1);
    expect(desempenho[0].dias).toHaveLength(1);
  });
});

/* O Mercado Livre devolve taxa em PERCENTUAL e a Shopee em FRAÇÃO, e as duas
   caem na mesma coluna. Sem conversão, um ACOS real de 20% viraria 0,2% na
   tabela — cem vezes menor, sem nada na tela denunciando. */
describe("escala das taxas da Shopee", () => {
  it("converte fração em percentual, como o Mercado Livre já grava", () => {
    expect(converterFracaoShopeeParaPercentual(0.0482)).toBe("4.82");
    expect(converterFracaoShopeeParaPercentual(0.2)).toBe("20");
    expect(converterFracaoShopeeParaPercentual(0.0159)).toBe("1.59");
  });

  it("preserva zero, que é medição de verdade, e ignora ausência", () => {
    expect(converterFracaoShopeeParaPercentual(0)).toBe("0");
    expect(converterFracaoShopeeParaPercentual(undefined)).toBeNull();
    expect(converterFracaoShopeeParaPercentual(null)).toBeNull();
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
