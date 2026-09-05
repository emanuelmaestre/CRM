import { afterEach, describe, expect, it, vi } from "vitest";
import { MercadoLivreProvider } from "@/modules/canais/infrastructure/mercadolivre.provider";

const inicio = new Date("2026-08-30T03:00:00Z");
const fim = new Date("2026-08-31T02:59:59.999Z");
const agora = new Date("2026-09-01T12:00:00Z");
const pedido = (id: number, date_created: string, status = "paid", quantity = 1, pago = status === "paid") => ({
  id, date_created, status, total_amount: 10.1, pack_id: 123,
  paid_amount: pago ? 10.1 : 0,
  payments: pago ? [{ status: "approved", total_paid_amount: 10.1 }] : [],
  order_items: [{ quantity, unit_price: 10.1, item: { id: `MLB${id}` } }],
});

function preparar(results = [pedido(1, "2026-08-30T12:00:00Z")], visitas: object | null = { total_visits: 100, date_from: "2026-08-30T00:00:00-04:00", date_to: "2026-08-30T00:00:00-04:00" }) {
  const chamadas: URL[] = [];
  vi.stubGlobal("fetch", vi.fn(async (entrada: string | URL) => {
    const url = new URL(String(entrada));
    chamadas.push(url);
    if (url.pathname === "/users/me") return Response.json({ id: "seller-1" });
    if (url.pathname.endsWith("/items_visits")) return visitas ? Response.json(visitas) : Response.json({ error: "forbidden" }, { status: 403 });
    if (url.pathname === "/orders/search") return Response.json({ results, paging: { total: results.length } });
    throw new Error("Endpoint de enriquecimento não deve ser chamado.");
  }));
  return { provider: new MercadoLivreProvider({ clientId: "c", clientSecret: "s", accessToken: "t", refreshToken: "r" }), chamadas };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("fontes oficiais dos oito cards", () => {
  it("mantém a conferência em Brasília e alinha pedidos/visitas ao calendário UTC-4", async () => {
    const { provider, chamadas } = preparar([
      pedido(1, "2026-08-30T03:30:00Z"), // Só conferência, não pertence ao dia UTC-4.
      pedido(2, "2026-08-30T04:00:00Z", "paid", 2),
      pedido(3, "2026-08-30T18:00:00Z", "cancelled", 3, true),
      pedido(4, "2026-08-31T03:30:00Z", "returned", 1, true), // Só desempenho.
      pedido(5, "2026-08-30T20:00:00Z", "payment_required", 99), // Carrinho/checkout sem pagamento.
    ]);
    const resumo = await provider.resumirFaturamentoOficial(inicio, fim, true, agora);
    expect(resumo).toMatchObject({ faturamento: 20.2, totalPedidos: 4, canceladosQtd: 1, totalBruto: 30.3,
      desempenho: { vendasBrutas: 30.3, quantidadeVendas: 3, unidadesVendidas: 6, vendasCanceladas: 1, visitas: 100 } });
    // Não agrupa os pedidos de um mesmo pack e não mistura devolução com cancelamento.
    const visita = chamadas.find((url) => url.pathname.endsWith("/items_visits"))!;
    expect(visita.searchParams.get("date_from")).toBe("2026-08-30");
    expect(visita.searchParams.get("date_to")).toBe("2026-08-30");
    expect(chamadas.find((url) => url.pathname === "/orders/search")!.searchParams.get("order.date_created.to")).toBe("2026-08-31T03:59:59.999Z");
  });

  it("não trata cancelamento sem pagamento como venda nem ajuste financeiro", async () => {
    const { provider } = preparar([
      pedido(1, "2026-08-30T12:00:00Z", "paid", 1, true),
      pedido(2, "2026-08-30T13:00:00Z", "cancelled", 1, false),
      pedido(3, "2026-08-30T14:00:00Z", "cancelled", 1, true),
    ]);

    const resumo = await provider.resumirFaturamentoOficial(inicio, fim, true, agora);
    expect(resumo).toMatchObject({
      faturamento: 10.1,
      canceladosQtd: 1,
      canceladosValor: 10.1,
      totalBruto: 20.2,
      desempenho: { vendasBrutas: 20.2, quantidadeVendas: 2, vendasCanceladas: 1 },
    });
  });

  it("não zera os pedidos quando a API de visitas está sem permissão", async () => {
    const { provider } = preparar(undefined, null);
    expect((await provider.resumirFaturamentoOficial(inicio, fim, true, agora)).desempenho)
      .toMatchObject({ vendasBrutas: 10.1, quantidadeVendas: 1, visitas: null });
  });

  it("recusa visitas sem total, negativas ou em outro fuso", async () => {
    for (const resposta of [{}, { total_visits: -1 }, { total_visits: 100, date_from: "2026-08-30T00:00:00Z", date_to: "2026-08-30T00:00:00Z" }]) {
      const { provider } = preparar(undefined, resposta);
      await expect(provider.obterVisitasVendedor(inicio, fim)).rejects.toThrow(/visitas/);
    }
  });

  it("unidade ausente fica indisponível sem invalidar faturamento", async () => {
    const { provider } = preparar([{ ...pedido(1, "2026-08-30T12:00:00Z"), order_items: [] }]);
    expect((await provider.resumirFaturamentoOficial(inicio, fim, true, agora)).desempenho)
      .toMatchObject({ vendasBrutas: 10.1, unidadesVendidas: null });
  });

  it("não aceita paginação incompleta como dados oficiais", async () => {
    const { provider } = preparar();
    vi.stubGlobal("fetch", vi.fn(async (entrada: string | URL) => String(entrada).endsWith("/users/me")
      ? Response.json({ id: "seller-1" }) : Response.json({ results: [], paging: { total: 2 } })));
    await expect(provider.resumirFaturamentoOficial(inicio, fim, true, agora)).rejects.toThrow(/página vazia/);
  });

  it("não transforma valor monetário nulo da origem em faturamento zero", async () => {
    const { provider } = preparar();
    vi.stubGlobal("fetch", vi.fn(async (entrada: string | URL) => String(entrada).endsWith("/users/me")
      ? Response.json({ id: "seller-1" }) : Response.json({ results: [{ ...pedido(1, "2026-08-30T12:00:00Z"), total_amount: null }], paging: { total: 1 } })));
    await expect(provider.resumirFaturamentoOficial(inicio, fim, true, agora)).rejects.toThrow(/sem total válido/);
  });
});
