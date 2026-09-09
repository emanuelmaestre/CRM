import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const send = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/inngest/client", () => ({ inngest: { send } }));
vi.mock("@/shared/lib/rate-limit", () => ({ verificarRateLimit: async () => null }));
import { POST } from "@/app/api/webhooks/tiktokshop/route";

function requisicao(assinada = true) {
  const body = JSON.stringify({ shop_id: "loja", type: 12, tts_notification_id: "aviso", data: { order_id: "123" } });
  return new NextRequest("https://crm.test/api/webhooks/tiktokshop", { method: "POST", body,
    headers: { authorization: assinada ? crypto.createHmac("sha256", "segredo-teste").update(`chave-teste${body}`).digest("hex") : "inválida" },
  });
}
describe("fila durável do webhook TikTok", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("TIKTOK_APP_SECRET", "segredo-teste"); vi.stubEnv("TIKTOK_APP_KEY", "chave-teste"); send.mockResolvedValue({ ids: ["id"] }); });
  afterEach(() => vi.unstubAllEnvs());
  it("confirma após enfileirar e usa o mesmo ID na reentrega", async () => {
    expect((await POST(requisicao())).status).toBe(200);
    expect((await POST(requisicao())).status).toBe(200);
    expect(send.mock.calls[0][0]).toEqual(send.mock.calls[1][0]);
    expect(send.mock.calls[0][0]).toMatchObject({ id: "tiktok-loja-aviso", data: { orderId: "123", type: 12 } });
  });
  it("não confirma uma notificação que a fila recusou", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    send.mockRejectedValue(new Error("fila indisponível"));
    expect((await POST(requisicao())).status).toBe(500);
    log.mockRestore();
  });
  it("rejeita assinatura inválida antes da fila", async () => {
    expect((await POST(requisicao(false))).status).toBe(401);
    expect(send).not.toHaveBeenCalled();
  });
});
