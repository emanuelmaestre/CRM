import { describe, expect, it, vi } from "vitest";

vi.mock("@/shared/lib/shopee-proxy", () => ({ shopeeFetch: vi.fn() }));

import { shopeeFetch } from "@/shared/lib/shopee-proxy";
import { ShopeeProvider } from "@/modules/canais/infrastructure/shopee.provider";

const CREDS = { partnerId: "1", partnerKey: "k", shopId: "9", accessToken: "t" };
const DIA = 24 * 60 * 60 * 1000;

/* A sincronização manual pede 90 dias. A Shopee só aceita 15 por chamada, e o
   A31 rodava as 90 dentro de UM step.run: numa loja com volume (WUWU, 208
   pedidos em 90 dias, cada um pedindo get_order_detail pelo proxy) o step
   estourava os 300s, o Inngest reexecutava do zero e a execução ficava presa
   em `em_andamento` para sempre — travando Anúncios, Avaliações e Termômetro,
   que nem chegavam a rodar. Uma janela por step conclui e fica memoizada. */
describe("janelas de busca de pedidos da Shopee", () => {
  const provider = new ShopeeProvider(CREDS);

  it("fatia 90 dias em janelas de no máximo 15", () => {
    const ate = new Date("2026-08-27T00:00:00Z");
    const desde = new Date(ate.getTime() - 90 * DIA);
    const janelas = provider.janelasDePedidos(desde, ate);

    expect(janelas).toHaveLength(6);
    for (const j of janelas) {
      expect(j.fimMs - j.inicioMs).toBeLessThanOrEqual(15 * DIA);
      expect(j.fimMs).toBeGreaterThan(j.inicioMs);
    }
  });

  it("cobre o intervalo inteiro, sem buraco nem sobreposição", () => {
    const ate = new Date("2026-08-27T00:00:00Z");
    const desde = new Date(ate.getTime() - 90 * DIA);
    const janelas = provider.janelasDePedidos(desde, ate);

    expect(janelas[0].inicioMs).toBe(desde.getTime());
    expect(janelas.at(-1)!.fimMs).toBe(ate.getTime());
    for (let i = 1; i < janelas.length; i++) {
      // Fim de uma é começo da outra: pedido nenhum cai numa fresta.
      expect(janelas[i].inicioMs).toBe(janelas[i - 1].fimMs);
    }
  });

  it("intervalo curto vira uma janela só — o poller de 4 em 4 minutos não paga a mais", () => {
    const ate = new Date("2026-08-27T00:00:00Z");
    expect(provider.janelasDePedidos(new Date(ate.getTime() - 2 * DIA), ate)).toHaveLength(1);
  });

  it("intervalo vazio ou no futuro não gera janela nenhuma", () => {
    const ate = new Date("2026-08-27T00:00:00Z");
    expect(provider.janelasDePedidos(ate, ate)).toHaveLength(0);
    expect(provider.janelasDePedidos(new Date(ate.getTime() + DIA), ate)).toHaveLength(0);
  });
});

/* A fila de não importados precisa reler UM pedido no canal: a foto guardada
   dos pedidos parados desde junho é anterior ao `listingId`, e sem o anúncio
   o reprocesso só repete a busca por SKU que já falhou. O Mercado Livre já
   tinha `buscarPedidoPorId`; sem o par na Shopee, os pedidos dela ficavam
   presos para sempre (3 da ARMARINHOS LIMA, R$ 186,00, achados em 29/08/2026). */
describe("buscar um pedido da Shopee pelo order_sn", () => {
  const CREDS_PEDIDOS = { partnerId: "2", partnerKey: "kp", shopId: "9", accessToken: "tp" };

  function providerComResposta(detalhe: unknown) {
    const provider = new ShopeeProvider(CREDS, CREDS_PEDIDOS, CREDS_PEDIDOS);
    const chamadas: string[] = [];
    vi.mocked(shopeeFetch).mockImplementation(async (entrada: string | URL) => {
      const url = String(entrada);
      chamadas.push(url);
      const corpo = url.includes("get_order_detail")
        ? { response: { order_list: detalhe ? [detalhe] : [] } }
        // O escrow é enriquecimento: pedido entra sem ele.
        : { error: "sem_financeiro", message: "ignorado no teste" };
      return { ok: true, json: async () => corpo, text: async () => "" } as unknown as Response;
    });
    return { provider, chamadas };
  }

  const DETALHE = {
    order_sn: "260606BYN44TFD",
    order_status: "COMPLETED",
    total_amount: 59.71,
    create_time: 1780000000,
    buyer_username: "comprador",
    item_list: [{
      item_id: 58260533412,
      model_id: 0,
      model_quantity_purchased: 1,
      model_discounted_price: 59.71,
      item_name: "Kit de Linhas",
    }],
  };

  it("devolve o pedido com o anúncio e o título da venda", async () => {
    const { provider } = providerComResposta(DETALHE);
    const pedido = await provider.buscarPedidoPorId("260606BYN44TFD");

    expect(pedido.providerOrderId).toBe("260606BYN44TFD");
    expect(pedido.canal).toBe("shopee");
    // Sem SKU no anúncio, o SKU é o sintético do catálogo — e é justamente por
    // isso que o anúncio precisa vir junto para o produto poder nascer.
    expect(pedido.itens[0]).toMatchObject({
      skuExterno: "shopee-58260533412",
      listingId: "58260533412",
      variationId: null,
      titulo: "Kit de Linhas",
    });
  });

  it("pede o detalhe só daquele pedido, sem varrer janela nenhuma", async () => {
    const { provider, chamadas } = providerComResposta(DETALHE);
    await provider.buscarPedidoPorId("260606BYN44TFD");

    expect(chamadas.some((url) => url.includes("get_order_list"))).toBe(false);
    const detalhe = chamadas.find((url) => url.includes("get_order_detail"));
    expect(detalhe).toContain("order_sn_list=260606BYN44TFD");
  });

  it("falha claro quando a Shopee não devolve o pedido", async () => {
    const { provider } = providerComResposta(undefined);
    await expect(provider.buscarPedidoPorId("NAO_EXISTE")).rejects.toThrow(/não retornou detalhes/);
  });
});
