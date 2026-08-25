import { describe, expect, it, vi } from "vitest";
import {
  appDoCanalShopee,
  CANAIS_TOKEN_SHOPEE,
  SHOPEE_TOKEN_REFRESH_CRON,
  SHOPEE_TOKEN_REFRESH_MARGIN_MS,
  solicitarRenovacaoTokenShopee,
  tokenShopeePrecisaRenovar,
} from "@/modules/canais/application/shopee-token.service";

describe("renovação OAuth da Shopee", () => {
  it("executa uma vez por hora e seleciona tokens dentro da margem segura", () => {
    const agora = Date.parse("2026-08-23T12:00:00.000Z");
    expect(SHOPEE_TOKEN_REFRESH_CRON).toBe("12 * * * *");
    expect(SHOPEE_TOKEN_REFRESH_MARGIN_MS).toBe(60 * 60 * 1000);
    expect(tokenShopeePrecisaRenovar("2026-08-23T12:59:59.000Z", agora)).toBe(true);
    expect(tokenShopeePrecisaRenovar("2026-08-23T13:01:00.000Z", agora)).toBe(false);
    expect(tokenShopeePrecisaRenovar(null, agora)).toBe(true);
  });

  it("troca o refresh token e calcula a expiração", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: "access-novo",
      refresh_token: "refresh-novo",
      expire_in: 14_400,
      shop_id: 1645247022,
    }), { status: 200 }));

    const resultado = await solicitarRenovacaoTokenShopee("refresh-antigo", "1645247022", {
      request,
      agoraMs: Date.parse("2026-08-23T12:00:00.000Z"),
      partnerId: "2042574",
      partnerKey: "chave-secreta",
    });

    expect(resultado).toMatchObject({
      accessToken: "access-novo",
      refreshToken: "refresh-novo",
      expiresAt: "2026-08-23T16:00:00.000Z",
    });

    const [url, init] = request.mock.calls[0];
    expect(String(url)).toContain("/api/v2/auth/access_token/get");
    expect(init?.method).toBe("POST");
    const body = JSON.parse(init?.body as string);
    expect(body).toMatchObject({ refresh_token: "refresh-antigo", partner_id: 2042574, shop_id: 1645247022 });
  });

  it("propaga erro de negócio retornado pela Shopee, mesmo com HTTP 200", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: "error_auth",
      message: "invalid refresh_token",
    }), { status: 200 }));

    await expect(solicitarRenovacaoTokenShopee("refresh-invalido", "1645247022", {
      request,
      partnerId: "2042574",
      partnerKey: "chave-secreta",
    })).rejects.toThrow(/invalid refresh_token/);
  });
});

/* São dois apps no Open Platform, cada um com sua autorização OAuth e seu
   token — a Shopee autoriza por APP, não por loja. O A33 renovava só o token
   de catálogo; o de pedidos vencia de 4 em 4 horas sem ninguém renovar, e a
   sincronização de Pedidos falhava com "App Shopee Pedidos não conectado para
   esta marca" mesmo com o token presente no banco (25/08/2026). */
describe("renovação cobre os dois apps Shopee", () => {
  it("lista os dois canais de token", () => {
    expect([...CANAIS_TOKEN_SHOPEE]).toEqual(["shopee", "shopee_pedidos"]);
  });

  it("mapeia cada canal para o app que assina a renovação", () => {
    expect(appDoCanalShopee("shopee")).toBe("catalogo");
    expect(appDoCanalShopee("shopee_pedidos")).toBe("pedidos");
  });

  it("trata canal desconhecido como catálogo, o comportamento anterior ao segundo app", () => {
    expect(appDoCanalShopee("")).toBe("catalogo");
  });
});
