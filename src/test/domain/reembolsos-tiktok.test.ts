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
  it("identifica a loja pelo cipher da conta, sem confundir open_id com shop_id", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ code: 0, data: { shops: [
      { id: "outra", cipher: "outro-cipher" }, { id: "7494497511142753468", cipher: "shop" },
    ] } })));
    expect(await provider().obterIdLoja()).toBe("7494497511142753468");
  });
  it("conserva o demonstrativo de hoje e filtra a sobreposição devolvida pela API", async () => {
    const inicio = new Date("2026-09-08T00:00:00Z"), fim = new Date("2026-09-09T13:00:00Z");
    const fetch = vi.fn().mockResolvedValue(Response.json({ code: 0, data: { statements: [
      { id: "antes", statement_time: Date.parse("2026-09-07T00:00:00Z") / 1000 },
      { id: "hoje", statement_time: Date.parse("2026-09-09T00:00:00Z") / 1000 },
      { id: "futuro", statement_time: Date.parse("2026-09-10T00:00:00Z") / 1000 },
    ] } }));
    vi.stubGlobal("fetch", fetch);
    expect(await provider().listarExtratos(inicio.getTime(), fim.getTime())).toEqual(["hoje"]);
    expect(Number(new URL(fetch.mock.calls[0][0]).searchParams.get("statement_time_lt"))).toBe(fim.getTime() / 1000 + 86400);
  });
  it.each([true, false])("reembolso rápido exige o evento financeiro; sucesso=%s", async (sucesso) => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ code: 0, data: { total_count: 1, return_orders: [caso({ is_quick_refund: true, return_status: "BUYER_SHIPPED_ITEM" })] } }))
      .mockResolvedValueOnce(Response.json({ code: 0, data: { records: [{ event: sucesso ? "REFUND_SUCCESS" : "BUYER_SHIPPED", create_time: 1788200842 }] } }));
    vi.stubGlobal("fetch", fetch);
    const casos = await provider().listarReembolsos(desde, ate, ["pedido"]);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ order_ids: ["pedido"] });
    expect(casos[0].status).toBe("BUYER_SHIPPED_ITEM");
    expect(reembolsoParcialInformado({ reembolsosTikTok: casos })).toBe(sucesso ? 111.1 : 0);
  });
  it("falha se a consulta do histórico rápido estiver incompleta", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json({ code: 0, data: { total_count: 1, return_orders: [caso({ is_quick_refund: true, return_status: "BUYER_SHIPPED_ITEM" })] } }))
      .mockResolvedValueOnce(Response.json({ code: 0, data: {} })));
    await expect(provider().listarReembolsos(desde, ate)).rejects.toThrow(/histórico/);
  });
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
  it("preserva prova de reembolso quando a próxima atualização só informa logística", () => {
    const pago = normalizarReembolsoTikTok(caso({ return_status: "BUYER_SHIPPED_ITEM" }), 1788200842000);
    const logistico = normalizarReembolsoTikTok(caso({ return_status: "BUYER_SHIPPED_ITEM", update_time: 1788899258 }));
    expect(reembolsoParcialInformado({ reembolsosTikTok: mesclarReembolsosTikTok([pago], [logistico]) })).toBe(111.1);
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
