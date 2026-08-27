import { beforeEach, describe, expect, it, vi } from "vitest";

const shopeeFetchMock = vi.fn();
vi.mock("@/shared/lib/shopee-proxy", () => ({ shopeeFetch: (...args: unknown[]) => shopeeFetchMock(...args) }));

import { ShopeeProvider } from "@/modules/canais/infrastructure/shopee.provider";
import { resumirDiagnosticoShopee } from "@/modules/estoque/application/importar-catalogo.service";
import { contagemDePendencia } from "@/modules/canais/application/painel-atualizacao.service";

const CREDS = { partnerId: "1", partnerKey: "k", shopId: "9", accessToken: "t" };

function ok(corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), { status: 200 });
}

/* Caso real da ARMARINHOS LIMA (26/08/2026): o catálogo da Shopee terminava
   toda execução com produtosCriados 0 e ZERO variações, enquanto pedidos
   chegavam com SKUs de variação que não existiam como produto. O anúncio com
   variação era descartado inteiro quando get_model_list falhava, e o motivo
   morria num console.error. */
describe("catálogo da Shopee — anúncio com variação que a API não devolve", () => {
  beforeEach(() => {
    shopeeFetchMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  function responder({ modelosFalham }: { modelosFalham: boolean }) {
    shopeeFetchMock.mockImplementation((url: unknown) => {
      const caminho = new URL(String(url)).pathname;
      if (caminho.endsWith("/product/get_item_list")) {
        return Promise.resolve(ok({ response: { item: [{ item_id: 111 }], has_next_page: false } }));
      }
      if (caminho.endsWith("/product/get_item_base_info")) {
        return Promise.resolve(ok({
          response: {
            item_list: [{
              item_id: 111,
              item_name: "Kit 4 peças",
              item_sku: "KIT4",
              item_status: "NORMAL",
              // Campo real: conferido ao vivo contra a loja WUWU em 27/08/2026.
              // O fixture antes usava `tier_variation`, que a API NUNCA devolve
              // — o teste passava contra uma resposta que não existe.
              has_model: true,
              stock_info_v2: { summary_info: { total_available_stock: 7 } },
              price_info: [{ current_price: 10 }],
            }],
          },
        }));
      }
      if (caminho.endsWith("/product/get_model_list")) {
        return modelosFalham
          ? Promise.resolve(new Response("upstream caiu", { status: 500 }))
          : Promise.resolve(ok({
            response: {
              model: [
                { model_id: 5, model_sku: "KIT4_ESSENZA", stock_info_v2: { summary_info: { total_available_stock: 3 } }, price_info: [{ current_price: 10 }] },
                { model_id: 6, model_sku: "KIT4_HERITAGE", stock_info_v2: { summary_info: { total_available_stock: 4 } }, price_info: [{ current_price: 10 }] },
              ],
            },
          }));
      }
      return Promise.resolve(ok({ response: {} }));
    });
  }

  it("quando as variações vêm, cada uma vira um item com o SKU dela", async () => {
    responder({ modelosFalham: false });
    const { itens, diagnostico } = await new ShopeeProvider(CREDS).listarCatalogoAtivo();

    expect(itens.map((i) => i.externalSku)).toEqual(["KIT4_ESSENZA", "KIT4_HERITAGE"]);
    expect(diagnostico.comVariacao).toBe(1);
    expect(diagnostico.variacoesIndisponiveis).toBe(0);
    expect(resumirDiagnosticoShopee(diagnostico)).toBeNull();
  });

  it("quando a busca de variação falha, o anúncio NÃO some — entra no nível do anúncio", async () => {
    responder({ modelosFalham: true });
    const { itens, diagnostico } = await new ShopeeProvider(CREDS).listarCatalogoAtivo();

    // Era exatamente aqui que o catálogo perdia o anúncio inteiro.
    expect(itens).toHaveLength(1);
    expect(itens[0]).toMatchObject({ listingId: "111", variationId: null, externalSku: "KIT4" });
    expect(diagnostico.variacoesIndisponiveis).toBe(1);
    expect(diagnostico.motivosVariacao.length).toBeGreaterThan(0);

    const aviso = resumirDiagnosticoShopee(diagnostico);
    expect(aviso).toContain("1 anúncio(s) com variação que a Shopee não devolveu");
  });

  it("anúncio fora do status à venda é contado, não some em silêncio", async () => {
    shopeeFetchMock.mockImplementation((url: unknown) => {
      const caminho = new URL(String(url)).pathname;
      if (caminho.endsWith("/product/get_item_list")) {
        return Promise.resolve(ok({ response: { item: [{ item_id: 222 }], has_next_page: false } }));
      }
      if (caminho.endsWith("/product/get_item_base_info")) {
        return Promise.resolve(ok({
          response: { item_list: [{ item_id: 222, item_name: "Pausado", item_status: "BANNED" }] },
        }));
      }
      return Promise.resolve(ok({ response: {} }));
    });

    const { itens, diagnostico } = await new ShopeeProvider(CREDS).listarCatalogoAtivo();

    expect(itens).toHaveLength(0);
    expect(diagnostico.anunciosConsultados).toBe(1);
    expect(diagnostico.foraDoStatusNormal).toBe(1);
    expect(resumirDiagnosticoShopee(diagnostico)).toContain('1 anúncio(s) fora do status "à venda"');
  });
});

/* A faixa de pendências do painel lia `ignorados` cru de qualquer módulo. No
   Catálogo, `ignorados` conta anúncio JÁ MAPEADO — o estado normal —, então
   toda sincronização saudável de uma loja de 65 anúncios anunciaria "65 itens
   ficaram de fora". Só `motivos`/`aviso` significam algo de fato errado. */
describe("painel — o que conta como pendência", () => {
  it("catálogo saudável (só anúncio já mapeado) não vira pendência", () => {
    expect(contagemDePendencia({ produtosCriados: 0, ignorados: 65, progresso: 100 }))
      .toEqual({ ignorados: 0, motivos: [] });
  });

  it("catálogo com variação indisponível vira pendência, contando os anúncios, não os 65", () => {
    const r = contagemDePendencia({
      produtosCriados: 0,
      ignorados: 65,
      aviso: "3 anúncio(s) com variação que a Shopee não devolveu",
      diagnostico: { variacoesIndisponiveis: 3, foraDoStatusNormal: 2 },
    });
    expect(r.ignorados).toBe(5);
    expect(r.motivos).toEqual(["3 anúncio(s) com variação que a Shopee não devolveu"]);
  });

  it("pedidos usa ignorados e motivos, como antes", () => {
    const r = contagemDePendencia({ ignorados: 1, motivos: ["Pedido não importado: SKUs sem produto na marca: KIT4_ESSENZA."] });
    expect(r.ignorados).toBe(1);
    expect(r.motivos).toHaveLength(1);
  });
});
