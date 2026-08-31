import { afterEach, describe, expect, it, vi } from "vitest";
import { MercadoLivreProvider } from "@/modules/canais/infrastructure/mercadolivre.provider";

const CREDS = { clientId: "c", clientSecret: "s", accessToken: "t", refreshToken: "r" };
const DIA = 24 * 60 * 60 * 1000;

const pedidoFalso = (id: number, status = "paid", total = 24.9) => ({
  id,
  status,
  total_amount: total,
  buyer: { id: 9, nickname: "comprador" },
  order_items: [{ item: { seller_sku: `SKU-${id}` }, quantity: 1, unit_price: 24.9 }],
  date_created: "2026-08-26T23:10:15.000-04:00",
});

/* A busca de pedidos do Mercado Livre era uma chamada só: `limit=50`, sem
   `offset` e sem `sort` — e o sort PADRÃO do ML é `date_asc`. Ela ficava com os
   50 pedidos MAIS ANTIGOS do intervalo e descartava o resto calado. Na
   sincronização manual (90 dias, `paging.total` de 3.356 na WUWU em 27/08/2026)
   isso devolvia sempre os mesmos 50 pedidos de três meses atrás, todos já no
   banco: "50 encontrados, 0 novos" em toda execução. */
describe("busca de pedidos do Mercado Livre", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function stubBusca(totalDePedidos: number) {
    const chamadas: URL[] = [];
    const fetchMock = vi.fn(async (entrada: string | URL) => {
      const url = new URL(String(entrada));
      chamadas.push(url);
      if (url.pathname === "/users/me") {
        return new Response(JSON.stringify({ id: "seller-1" }), { status: 200 });
      }
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = Number(url.searchParams.get("limit") ?? 50);
      const results = Array.from(
        { length: Math.max(0, Math.min(limit, totalDePedidos - offset)) },
        (_, i) => pedidoFalso(offset + i),
      );
      return new Response(JSON.stringify({ results, paging: { total: totalDePedidos } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    return chamadas;
  }

  it("segue a paginação até o total, em vez de parar nos 50 primeiros", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-08-27T00:00:00.000Z").getTime());
    const chamadas = stubBusca(123);
    const provider = new MercadoLivreProvider(CREDS);

    const pedidos = await provider.buscarPedidosDaJanela(
      new Date("2026-08-24T00:00:00.000Z").getTime(),
      new Date("2026-08-27T00:00:00.000Z").getTime(),
    );

    expect(pedidos).toHaveLength(123);
    // Sem duplicata e sem buraco: as três páginas são pedidos distintos.
    expect(new Set(pedidos.map((p) => p.providerOrderId)).size).toBe(123);

    const buscas = chamadas.filter((u) => u.pathname === "/orders/search");
    expect(buscas.map((u) => u.searchParams.get("offset"))).toEqual(["0", "50", "100"]);
    expect(buscas.every((u) => u.searchParams.get("sort") === "date_asc")).toBe(true);
    // O intervalo vai fechado nos dois lados — sem o `to`, a janela seguinte
    // rebuscaria tudo de novo.
    expect(buscas[0].searchParams.get("order.date_created.from")).toBe("2026-08-24T00:00:00.000Z");
    expect(buscas[0].searchParams.get("order.date_created.to")).toBe("2026-08-27T00:00:00.000Z");
  });

  it("para na última página sem pedir uma página vazia", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-08-27T00:00:00.000Z").getTime());
    const chamadas = stubBusca(50);
    const provider = new MercadoLivreProvider(CREDS);

    const pedidos = await provider.buscarPedidosDaJanela(
      new Date("2026-08-26T00:00:00.000Z").getTime(),
      new Date("2026-08-27T00:00:00.000Z").getTime(),
    );

    expect(pedidos).toHaveLength(50);
    // Página cheia, mas `paging.total` já foi atingido: não vale uma chamada
    // a mais para descobrir que acabou.
    expect(chamadas.filter((u) => u.pathname === "/orders/search")).toHaveLength(1);
  });

  it("fatia 90 dias em janelas de no máximo 3, sem buraco nem sobreposição", () => {
    const provider = new MercadoLivreProvider(CREDS);
    const ate = new Date("2026-08-27T00:00:00.000Z");
    const desde = new Date(ate.getTime() - 90 * DIA);
    const janelas = provider.janelasDePedidos(desde, ate);

    expect(janelas).toHaveLength(30);
    expect(janelas[0].inicioMs).toBe(desde.getTime());
    expect(janelas.at(-1)!.fimMs).toBe(ate.getTime());
    for (const j of janelas) expect(j.fimMs - j.inicioMs).toBeLessThanOrEqual(3 * DIA);
    for (let i = 1; i < janelas.length; i++) {
      expect(janelas[i].inicioMs).toBe(janelas[i - 1].fimMs);
    }
  });

  it("a janela de 4h da contingência (A24) continua sendo uma chamada só de busca", async () => {
    const agora = new Date("2026-08-27T00:00:00.000Z");
    vi.spyOn(Date, "now").mockReturnValue(agora.getTime());
    const chamadas = stubBusca(7);
    const provider = new MercadoLivreProvider(CREDS);

    expect(provider.janelasDePedidos(new Date(agora.getTime() - 4 * 60 * 60 * 1000))).toHaveLength(1);

    const pedidos = await provider.buscarPedidos(new Date(agora.getTime() - 4 * 60 * 60 * 1000));
    expect(pedidos).toHaveLength(7);
    expect(chamadas.filter((u) => u.pathname === "/orders/search")).toHaveLength(1);
  });

  it("não repete /users/me a cada janela", async () => {
    const agora = new Date("2026-08-27T00:00:00.000Z");
    vi.spyOn(Date, "now").mockReturnValue(agora.getTime());
    const chamadas = stubBusca(1);
    const provider = new MercadoLivreProvider(CREDS);

    await provider.buscarPedidos(new Date(agora.getTime() - 9 * DIA));

    expect(provider.janelasDePedidos(new Date(agora.getTime() - 9 * DIA))).toHaveLength(3);
    expect(chamadas.filter((u) => u.pathname === "/orders/search")).toHaveLength(3);
    expect(chamadas.filter((u) => u.pathname === "/users/me")).toHaveLength(1);
  });

  it("intervalo vazio ou no futuro não gera janela nenhuma", () => {
    const provider = new MercadoLivreProvider(CREDS);
    const ate = new Date("2026-08-27T00:00:00.000Z");
    expect(provider.janelasDePedidos(ate, ate)).toHaveLength(0);
    expect(provider.janelasDePedidos(new Date(ate.getTime() + DIA), ate)).toHaveLength(0);
  });

  it("resume o faturamento oficial sem chamar endpoints de enriquecimento", async () => {
    const chamadas: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (entrada: string | URL) => {
      const url = new URL(String(entrada));
      chamadas.push(url);
      if (url.pathname === "/users/me") {
        return new Response(JSON.stringify({ id: "seller-1" }), { status: 200 });
      }
      return new Response(JSON.stringify({
        results: [pedidoFalso(1, "paid", 100.1), pedidoFalso(2, "cancelled", 20.2), pedidoFalso(3, "returned", 30.3)],
        paging: { total: 3 },
      }), { status: 200 });
    }));
    const provider = new MercadoLivreProvider(CREDS);

    const resumo = await provider.resumirFaturamentoOficial(
      new Date("2026-08-26T00:00:00.000Z"),
      new Date("2026-08-27T00:00:00.000Z"),
    );

    expect(resumo).toEqual({
      faturamento: 100.1,
      pedidosValidos: 1,
      canceladosValor: 50.5,
      canceladosQtd: 2,
      totalBruto: 150.6,
      totalPedidos: 3,
    });
    expect(chamadas.filter((url) => url.pathname.startsWith("/shipments/"))).toHaveLength(0);
    expect(chamadas.filter((url) => url.pathname === "/orders/search")).toHaveLength(1);
  });
});
