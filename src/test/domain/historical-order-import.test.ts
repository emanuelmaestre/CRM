import { afterEach, describe, expect, it, vi } from "vitest";
import { deveExecutarEfeitosOperacionais } from "@/modules/canais/domain/order-status";
import {
  serializarPedidoHistorico,
  validarPedidoHistorico,
} from "@/modules/importacao/application/importacao-historica.service";
import { MercadoLivreProvider } from "@/modules/canais/infrastructure/mercadolivre.provider";

const pedido = {
  providerOrderId: "2000000000001",
  canal: "mercadolivre",
  clienteExternalId: "buyer-1",
  clienteNome: "Cliente historico",
  status: "paid",
  total: "49.90",
  frete: "5.00",
  itens: [{ skuExterno: "SKU-OK", quantidade: 2, precoUnitario: "24.95" }],
  criadoEm: new Date("2025-02-10T14:30:00.000Z"),
};

describe("importacao historica de pedidos", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("mantem efeitos operacionais exclusivos do tempo real", () => {
    expect(deveExecutarEfeitosOperacionais("tempo_real")).toBe(true);
    expect(deveExecutarEfeitosOperacionais("historico")).toBe(false);
  });

  it("serializa datas para JSON e libera somente SKUs mapeados", () => {
    const payload = serializarPedidoHistorico(pedido);
    expect(payload.criadoEm).toBe("2025-02-10T14:30:00.000Z");
    expect(JSON.parse(JSON.stringify(payload))).toEqual(payload);
    expect(validarPedidoHistorico(payload, new Set(["SKU-OK"]))).toEqual({ payload, pendencias: [] });
  });

  it("coloca SKU ausente ou desconhecido em quarentena", () => {
    const semSku = serializarPedidoHistorico({ ...pedido, itens: [{ ...pedido.itens[0], skuExterno: "" }] });
    const desconhecido = serializarPedidoHistorico({ ...pedido, itens: [{ ...pedido.itens[0], skuExterno: "SKU-NOVO" }] });
    expect(validarPedidoHistorico(semSku, new Set()).pendencias[0]?.codigo).toBe("sku_ausente");
    expect(validarPedidoHistorico(desconhecido, new Set(["SKU-OK"])).pendencias).toEqual([
      expect.objectContaining({ codigo: "sku_nao_mapeado", sku: "SKU-NOVO" }),
    ]);
  });

  it("pagina o historico no intervalo solicitado e preserva a data original", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "seller-1" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        paging: { total: 1699, offset: 50, limit: 50 },
        results: [{
          id: 123,
          status: "paid",
          total_amount: 49.9,
          buyer: { id: 9, nickname: "buyer" },
          order_items: [{ item: { seller_sku: "SKU-OK" }, quantity: 2, unit_price: 24.95 }],
          date_created: "2025-02-10T14:30:00.000Z",
        }],
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new MercadoLivreProvider({
      clientId: "client",
      clientSecret: "secret",
      accessToken: "token",
      refreshToken: "refresh",
    });
    const result = await provider.listarPedidosHistoricos({
      de: new Date("2025-01-01T00:00:00.000Z"),
      ate: new Date("2025-12-31T23:59:59.999Z"),
      offset: 50,
      limit: 50,
    });
    expect(result).toMatchObject({ total: 1699, offset: 50, limit: 50 });
    expect(result.pedidos[0].criadoEm.toISOString()).toBe("2025-02-10T14:30:00.000Z");
    const url = new URL(String(fetchMock.mock.calls[1][0]));
    expect(url.searchParams.get("offset")).toBe("50");
    expect(url.searchParams.get("order.date_created.from")).toBe("2025-01-01T00:00:00.000Z");
    expect(url.searchParams.get("order.date_created.to")).toBe("2025-12-31T23:59:59.999Z");
  });
});
