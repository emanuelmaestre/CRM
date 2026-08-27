import { describe, expect, it, vi } from "vitest";

vi.mock("@/shared/lib/shopee-proxy", () => ({ shopeeFetch: vi.fn() }));

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
