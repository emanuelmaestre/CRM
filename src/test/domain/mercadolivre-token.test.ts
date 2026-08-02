import { describe, expect, it, vi } from "vitest";
import {
  ML_TOKEN_REFRESH_CRON,
  ML_TOKEN_REFRESH_MARGIN_MS,
  solicitarRenovacaoTokenMercadoLivre,
  tokenMercadoLivrePrecisaRenovar,
} from "@/modules/canais/application/mercadolivre-token.service";

describe("renovação OAuth do Mercado Livre", () => {
  it("executa a cada hora e seleciona tokens dentro da margem segura", () => {
    const agora = Date.parse("2026-08-02T12:00:00.000Z");
    expect(ML_TOKEN_REFRESH_CRON).toBe("0 * * * *");
    expect(ML_TOKEN_REFRESH_MARGIN_MS).toBe(90 * 60 * 1000);
    expect(tokenMercadoLivrePrecisaRenovar("2026-08-02T13:29:59.000Z", agora)).toBe(true);
    expect(tokenMercadoLivrePrecisaRenovar("2026-08-02T13:31:00.000Z", agora)).toBe(false);
    expect(tokenMercadoLivrePrecisaRenovar(null, agora)).toBe(true);
  });

  it("troca o refresh token e calcula a expiração", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: "access-novo",
      refresh_token: "refresh-novo",
      expires_in: 21_600,
      scope: "offline_access read write",
      user_id: 2901062325,
    }), { status: 200 }));

    const resultado = await solicitarRenovacaoTokenMercadoLivre("refresh-antigo", {
      request,
      agoraMs: Date.parse("2026-08-02T12:00:00.000Z"),
      clientId: "client",
      clientSecret: "secret",
    });

    expect(resultado).toMatchObject({
      accessToken: "access-novo",
      refreshToken: "refresh-novo",
      expiresAt: "2026-08-02T18:00:00.000Z",
      sellerId: "2901062325",
    });
    const body = request.mock.calls[0][1]?.body as URLSearchParams;
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("refresh-antigo");
  });
});
