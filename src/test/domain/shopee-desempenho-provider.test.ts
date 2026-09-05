import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/shared/lib/shopee-proxy", () => ({ shopeeFetch: vi.fn() }));
import { shopeeFetch } from "@/shared/lib/shopee-proxy";
import { ShopeeProvider } from "@/modules/canais/infrastructure/shopee.provider";
import { consolidarDesempenho } from "@/modules/vendas/domain/desempenho-canal";

const creds = { partnerId: "1", partnerKey: "k", shopId: "9", accessToken: "t" };
const inicio = new Date("2026-08-31T03:00:00Z");
const fim = new Date("2026-09-01T02:59:59.999Z");
const agora = new Date("2026-08-31T12:00:00Z");
const itens = (quantidades: number[]) => quantidades.map((model_quantity_purchased, i) => ({ model_quantity_purchased, model_id: i, model_discounted_price: 10 }));
const detalhes = [
  { order_sn: "A", total_amount: 110, order_status: "COMPLETED", item_list: itens([2, 3]) },
  { order_sn: "B", total_amount: 20.2, order_status: "CANCELLED", item_list: itens([1]) },
  { order_sn: "C", total_amount: 30.3, order_status: "TO_RETURN", item_list: itens([2]) },
  { order_sn: "D", total_amount: 40.4, order_status: "IN_CANCEL", item_list: itens([1]) },
  { order_sn: "E", total_amount: 999, order_status: "TO_PAY", item_list: itens([100]) },
];

function preparar(respostas: unknown[] = detalhes, pedidos = detalhes.map((d) => ({ order_sn: d.order_sn, order_status: "READY_TO_SHIP" }))) {
  const chamadas: URL[] = [];
  vi.mocked(shopeeFetch).mockImplementation(async (input) => {
    const url = new URL(String(input));
    chamadas.push(url);
    if (url.pathname.endsWith("get_order_list")) return Response.json({ response: { order_list: pedidos, more: false } });
    if (url.pathname.endsWith("get_order_detail")) return Response.json({ response: { order_list: respostas } });
    if (url.pathname.includes("escrow")) return Response.json({ response: [{ escrow_detail: { order_sn: "A", order_income: { buyer_total_amount: 100.1 } } }] });
    throw new Error("Não deve buscar anúncios, endereços ou dados de Ads.");
  });
  return { provider: new ShopeeProvider(creds, creds, creds), chamadas };
}
afterEach(() => vi.clearAllMocks());

describe("indicadores reais da Shopee", () => {
  it("soma variações, usa o financeiro e distingue cancelamento confirmado de devolução/solicitação", async () => {
    const { provider, chamadas } = preparar();
    const resumo = await provider.resumirFaturamentoOficial(inicio, fim, true, agora);
    expect(resumo).toMatchObject({ faturamento: 100.1, totalPedidos: 5, canceladosQtd: 3, totalBruto: 191,
      desempenho: { vendasBrutas: 191, unidadesVendidas: 9, quantidadeVendas: 4, vendasCanceladas: 1, visitas: null } });
    expect(consolidarDesempenho([resumo.desempenho!])).toMatchObject({ precoMedioVenda: 47.75, conversao: null });
    const detalhe = chamadas.find((u) => u.pathname.endsWith("get_order_detail"))!;
    expect(detalhe.searchParams.get("response_optional_fields")).toBe("total_amount,item_list");
    expect(chamadas.filter((u) => u.pathname.endsWith("get_order_detail"))).toHaveLength(1);
    const lista = chamadas.find((u) => u.pathname.endsWith("get_order_list"))!;
    expect(lista.searchParams.get("time_from")).toBe(String(inicio.getTime() / 1000));
    expect(lista.searchParams.get("time_to")).toBe(String(agora.getTime() / 1000));
  });

  it("não apresenta unidades parciais como totais quando um pedido não traz itens", async () => {
    const { provider } = preparar([{ ...detalhes[0], item_list: undefined }, ...detalhes.slice(1)]);
    const resumo = await provider.resumirFaturamentoOficial(inicio, fim, true, agora);
    expect(resumo.desempenho).toMatchObject({ vendasBrutas: 191, unidadesVendidas: null });
    expect(consolidarDesempenho([resumo.desempenho!]).precoMedioUnidade).toBeNull();
  });

  it.each([{ item_list: itens([0]) }, { item_list: [null] }, { item_list: [] }])("recusa itens inválidos, sem inventar uma unidade por item (%j)", async ({ item_list }) => {
    const { provider } = preparar([{ ...detalhes[0], item_list }, ...detalhes.slice(1)]);
    expect((await provider.resumirFaturamentoOficial(inicio, fim, true, agora)).desempenho?.unidadesVendidas).toBeNull();
  });

  it("retorna zeros reais sem pedidos, mas não inventa visitas nem médias", async () => {
    const { provider, chamadas } = preparar([], []);
    const resumo = await provider.resumirFaturamentoOficial(inicio, fim, true, agora);
    expect(consolidarDesempenho([resumo.desempenho!])).toEqual({ vendasBrutas: 0, unidadesVendidas: 0, quantidadeVendas: 0, vendasCanceladas: 0, visitas: null, conversao: null, precoMedioUnidade: null, precoMedioVenda: null });
    expect(chamadas).toHaveLength(1);
  });

  it("deduplica pedidos repetidos na listagem", async () => {
    const { provider } = preparar(detalhes, [...detalhes.map((d) => ({ order_sn: d.order_sn, order_status: d.order_status })), { order_sn: "A", order_status: "COMPLETED" }]);
    expect((await provider.resumirFaturamentoOficial(inicio, fim, true, agora)).desempenho?.quantidadeVendas).toBe(4);
  });

  it("falha quando falta um detalhe, em vez de publicar um total parcial", async () => {
    const { provider } = preparar(detalhes.slice(1));
    await expect(provider.resumirFaturamentoOficial(inicio, fim, true, agora)).rejects.toThrow(/total de 1 pedido/);
  });
});
