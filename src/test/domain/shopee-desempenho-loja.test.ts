import { describe, expect, it, vi, afterEach } from "vitest";
import { ShopeeProvider } from "@/modules/canais/infrastructure/shopee.provider";

/* Termômetro da Shopee (account_health/get_shop_performance).
 *
 * Diferente do Mercado Livre, onde os limites são estimativa nossa, aqui cada
 * métrica traz o próprio alvo e o próprio comparador. O risco é justamente
 * inverter a comparação: "meta < 5%" com valor 25% está FORA, e um sinal
 * trocado aqui vira alerta falso (ou pior, silêncio em loja com problema). */

const creds = { partnerId: "1", partnerKey: "k", shopId: "2", accessToken: "t" };

function respostaCom(body: unknown) {
  return vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
}

afterEach(() => vi.unstubAllGlobals());

describe("desempenho da loja Shopee", () => {
  it("marca fora da meta quem fura o próprio alvo, respeitando o comparador", async () => {
    vi.stubGlobal("fetch", respostaCom({
      response: {
        overall_performance: { rating: 2, fulfillment_failed: 3, listing_failed: 0, custom_service_failed: 1 },
        metric_list: [
          // Formato real da WUWU: atraso em 25% com meta abaixo de 5%.
          { metric_name: "late_shipment_rate", current_period: 25, last_period: 0, unit: 2, target: { value: 5, comparator: "<" } },
          { metric_name: "non_fulfillment_rate", current_period: 0, last_period: 0, unit: 2, target: { value: 8, comparator: "<" } },
          // Comparador invertido: aqui quanto MAIOR melhor.
          { metric_name: "response_rate", current_period: 50, last_period: 50, unit: 2, target: { value: 60, comparator: ">=" } },
        ],
      },
    }));

    const desempenho = await new ShopeeProvider(creds).obterDesempenhoLoja();

    expect(desempenho.rating).toBe(2);
    expect(desempenho.falhasEntrega).toBe(3);
    expect(desempenho.falhasAtendimento).toBe(1);

    const porNome = Object.fromEntries(desempenho.metricas.map((m) => [m.nome, m]));
    expect(porNome.late_shipment_rate.foraDaMeta).toBe(true);
    expect(porNome.non_fulfillment_rate.foraDaMeta).toBe(false);
    // 50 não alcança a meta de >= 60 — fora, mesmo o número sendo "alto".
    expect(porNome.response_rate.foraDaMeta).toBe(true);
  });

  it("não acusa problema quando a loja ainda não tem número no período", async () => {
    // Caso real do ARMARINHOS LIMA: métricas vieram null.
    vi.stubGlobal("fetch", respostaCom({
      response: {
        overall_performance: { rating: 3, fulfillment_failed: 1 },
        metric_list: [
          { metric_name: "late_shipment_rate", current_period: null, last_period: null, unit: 2, target: { value: 5, comparator: "<" } },
        ],
      },
    }));

    const desempenho = await new ShopeeProvider(creds).obterDesempenhoLoja();
    const metrica = desempenho.metricas[0];
    expect(metrica.valor).toBeNull();
    // "Não sei" nunca pode virar alerta.
    expect(metrica.foraDaMeta).toBe(false);
    expect(desempenho.falhasAnuncio).toBe(0);
  });

  it("marca como percentual só o que a Shopee declara como tal", async () => {
    vi.stubGlobal("fetch", respostaCom({
      response: {
        metric_list: [
          { metric_name: "late_shipment_rate", current_period: 25, unit: 2, target: { value: 5, comparator: "<" } },
          // Unidade diferente: contagem, não porcentagem — não pode virar "25%".
          { metric_name: "penalty_points", current_period: 4, unit: 1, target: { value: 2, comparator: "<" } },
        ],
      },
    }));

    const desempenho = await new ShopeeProvider(creds).obterDesempenhoLoja();
    expect(desempenho.metricas[0].ehPercentual).toBe(true);
    expect(desempenho.metricas[1].ehPercentual).toBe(false);
    // A comparação vale igual, independente da unidade.
    expect(desempenho.metricas[1].foraDaMeta).toBe(true);
  });

  it("propaga erro de negócio da Shopee em vez de devolver loja saudável", async () => {
    vi.stubGlobal("fetch", respostaCom({ error: "error_api_permission", message: "no permission" }));
    await expect(new ShopeeProvider(creds).obterDesempenhoLoja())
      .rejects.toThrow(/no permission/);
  });
});
