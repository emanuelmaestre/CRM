import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mesclarReembolsosTikTok, normalizarReembolsoTikTok, REEMBOLSO_TIKTOK_CONCLUIDO, type RetornoTikTokApi } from "@/modules/canais/domain/reembolsos-tiktok";
import { TikTokShopProvider } from "@/modules/canais/infrastructure/tiktokshop.provider";
import { reembolsoParcialInformado } from "@/modules/vendas/domain/status-faturamento";

const caso = (changes: Partial<RetornoTikTokApi> = {}): RetornoTikTokApi => ({
  order_id: "pedido", return_id: "retorno", return_type: "REFUND", return_status: REEMBOLSO_TIKTOK_CONCLUIDO,
  update_time: 1787798570, refund_amount: { currency: "BRL", refund_total: "111.10", refund_subtotal: "104.90", refund_shipping_fee: "6.20" }, ...changes,
});
const provider = () => new TikTokShopProvider({ appKey: "app", appSecret: "secret", accessToken: "token", shopCipher: "shop" });
const desde = new Date("2026-08-01T03:00:00Z"), ate = new Date("2026-09-08T12:00:00Z");
// Respostas simuladas não devem gravar telemetria no banco configurado pelo CI.
beforeEach(() => vi.stubEnv("DEFAULT_ORG_ID", ""));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("pós-venda TikTok", () => {
  it("usa o total devolvido com frete, sem somar casos cancelados nem a linha de SKU de novo", () => {
    const cases = [normalizarReembolsoTikTok(caso()), normalizarReembolsoTikTok(caso({ return_id: "cancelado", return_status: "RETURN_OR_REFUND_REQUEST_CANCEL" }))];
    expect(reembolsoParcialInformado({ reembolsosTikTok: cases })).toBe(111.1);
  });
  it("mescla casos por ID, preserva fora da janela e impede regressão de versão", () => {
    const a = normalizarReembolsoTikTok(caso());
    const antigo = { ...a, status: "RETURN_OR_REFUND_REQUEST_CANCEL", atualizadoEmMs: a.atualizadoEmMs - 1000 };
    expect(mesclarReembolsosTikTok([a], [a, antigo])).toEqual([a]);
    const b = { ...a, id: "outro", valor: 11.46 };
    expect(mesclarReembolsosTikTok([a], [b])).toHaveLength(2);
    expect(mesclarReembolsosTikTok([a], [{ ...antigo, atualizadoEmMs: a.atualizadoEmMs + 1000 }])[0].status).toBe(antigo.status);
  });
  it.each([
    { refund_amount: { currency: "BRL" } },
    { refund_amount: { currency: "USD", refund_total: "10" } },
    { refund_amount: { currency: "BRL", refund_total: "NaN" } },
  ])("recusa reembolso concluído sem quantia utilizável", (changes) => {
    expect(() => normalizarReembolsoTikTok(caso(changes))).toThrow();
  });
  it("pagina com o mesmo intervalo e não para por um total inferior ao tamanho máximo da página", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ code: 0, data: { total_count: 2, next_page_token: "p2", return_orders: [caso()] } }))
      .mockResolvedValueOnce(Response.json({ code: 0, data: { total_count: 2, next_page_token: "sobrando", return_orders: [caso({ return_id: "outro" })] } }));
    vi.stubGlobal("fetch", fetch);
    expect(await provider().listarReembolsos(desde, ate)).toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(new URL(fetch.mock.calls[1][0]).searchParams.get("page_token")).toBe("p2");
    expect(fetch.mock.calls[1][1].body).toBe(fetch.mock.calls[0][1].body);
  });
  it("aceita a resposta oficial de zero casos sem lista", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ code: 0, data: { total_count: 0, next_page_token: "" } })));
    expect(await provider().listarReembolsos(desde, ate)).toEqual([]);
  });
  it("falha na continuação ausente ou repetida em vez de publicar reembolsos incompletos", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ code: 0, data: { total_count: 2, next_page_token: "p2", return_orders: [caso()] } })));
    await expect(provider().listarReembolsos(desde, ate)).rejects.toThrow(/cursor/);
  });
  it("não interpreta autorização negada como ausência de reembolsos", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ code: 401, message: "scope denied" })));
    await expect(provider().listarReembolsos(desde, ate)).rejects.toThrow(/scope denied/);
  });
});
