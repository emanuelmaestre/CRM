import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appDoCanalShopee,
  CANAIS_TOKEN_SHOPEE,
  SHOPEE_TOKEN_REFRESH_CRON,
  SHOPEE_TOKEN_REFRESH_MARGIN_MS,
  solicitarRenovacaoTokenShopee,
  tokenShopeePrecisaRenovar,
} from "@/modules/canais/application/shopee-token.service";
import {
  canalTokenShopee,
  obterShopeeAppCredenciais,
  SHOPEE_APPS,
} from "@/shared/config/shopee-env";

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

/* São quatro apps no Open Platform, cada um com sua autorização OAuth e seu
   token — a Shopee autoriza por APP, não por loja. O A33 renovava só o token
   de catálogo; o de pedidos vencia de 4 em 4 horas sem ninguém renovar, e a
   sincronização de Pedidos falhava com "App Shopee Pedidos não conectado para
   esta marca" mesmo com o token presente no banco (25/08/2026). O de anúncios
   entrou em 26/08/2026 e o financeiro em 28/08/2026; os dois cairiam na mesma
   armadilha se ficassem de fora.

   Esta lista é conferida na unha de propósito. As outras asserções do bloco
   saem de SHOPEE_APPS e passariam sozinhas com um app novo — é justamente o
   que não se quer aqui: acrescentar um app TEM de fazer este teste falhar, pra
   obrigar quem acrescenta a conferir se o A33 e o /connect foram junto. */
describe("renovação cobre os quatro apps Shopee", () => {
  it("lista os quatro canais de token", () => {
    expect([...CANAIS_TOKEN_SHOPEE]).toEqual([
      "shopee", "shopee_pedidos", "shopee_anuncios", "shopee_financeiro",
    ]);
  });

  it("mapeia cada canal para o app que assina a renovação", () => {
    expect(appDoCanalShopee("shopee")).toBe("catalogo");
    expect(appDoCanalShopee("shopee_pedidos")).toBe("pedidos");
    expect(appDoCanalShopee("shopee_anuncios")).toBe("anuncios");
    expect(appDoCanalShopee("shopee_financeiro")).toBe("financeiro");
  });

  it("trata canal desconhecido como catálogo, o comportamento anterior ao segundo app", () => {
    expect(appDoCanalShopee("")).toBe("catalogo");
  });

  /* O motivo de existir uma linha de canal por app: cada autorização é
     independente, então conectar (ou reconectar) um não pode encostar no
     token dos outros. É essa ida e volta app→canal→app que garante isso. */
  it("mantém a ida e volta app → canal → app estável", () => {
    for (const app of SHOPEE_APPS) {
      expect(appDoCanalShopee(canalTokenShopee(app))).toBe(app);
    }
  });

  it("dá um canal diferente para cada app, sem colisão", () => {
    const canais = SHOPEE_APPS.map(canalTokenShopee);
    expect(new Set(canais).size).toBe(SHOPEE_APPS.length);
  });
});

/* Cada app lê seu próprio par partner_id/partner_key. Assinar com o par
   errado devolve "Wrong sign" — erro que não aponta pra causa. */
describe("credenciais por app Shopee", () => {
  const original = { ...process.env };
  afterEach(() => { process.env = { ...original }; });

  it("lê a env var própria de cada app, no ambiente escolhido", () => {
    process.env.SHOPEE_PARTNER_ID_LIVE = "catalogo-id";
    process.env.SHOPEE_PARTNER_KEY_LIVE = "catalogo-key";
    process.env.SHOPEE_PARTNER_ID_PEDIDOS_LIVE = "pedidos-id";
    process.env.SHOPEE_PARTNER_KEY_PEDIDOS_LIVE = "pedidos-key";
    process.env.SHOPEE_PARTNER_ID_ANUNCIOS_LIVE = "anuncios-id";
    process.env.SHOPEE_PARTNER_KEY_ANUNCIOS_LIVE = "anuncios-key";
    process.env.SHOPEE_PARTNER_ID_FINANCEIRO_LIVE = "financeiro-id";
    process.env.SHOPEE_PARTNER_KEY_FINANCEIRO_LIVE = "financeiro-key";

    expect(obterShopeeAppCredenciais("catalogo", "live")).toEqual({ partnerId: "catalogo-id", partnerKey: "catalogo-key" });
    expect(obterShopeeAppCredenciais("pedidos", "live")).toEqual({ partnerId: "pedidos-id", partnerKey: "pedidos-key" });
    expect(obterShopeeAppCredenciais("anuncios", "live")).toEqual({ partnerId: "anuncios-id", partnerKey: "anuncios-key" });
    expect(obterShopeeAppCredenciais("financeiro", "live")).toEqual({ partnerId: "financeiro-id", partnerKey: "financeiro-key" });
  });

  /* O app financeiro tem infixo próprio (FINANCEIRO_) e nenhum prefixo em
     comum com os outros três — sem isso ele cairia silenciosamente no par de
     catálogo e toda chamada voltaria "Wrong sign". */
  it("não confunde o app financeiro com o de catálogo quando só o de catálogo está configurado", () => {
    process.env.SHOPEE_PARTNER_ID_LIVE = "catalogo-id";
    process.env.SHOPEE_PARTNER_KEY_LIVE = "catalogo-key";
    delete process.env.SHOPEE_PARTNER_ID_FINANCEIRO_LIVE;
    delete process.env.SHOPEE_PARTNER_KEY_FINANCEIRO_LIVE;

    expect(obterShopeeAppCredenciais("financeiro", "live")).toEqual({ partnerId: undefined, partnerKey: undefined });
  });

  it("não confunde o app de anúncios com o de catálogo quando só o de catálogo está configurado", () => {
    process.env.SHOPEE_PARTNER_ID_LIVE = "catalogo-id";
    process.env.SHOPEE_PARTNER_KEY_LIVE = "catalogo-key";
    delete process.env.SHOPEE_PARTNER_ID_ANUNCIOS_LIVE;
    delete process.env.SHOPEE_PARTNER_KEY_ANUNCIOS_LIVE;

    expect(obterShopeeAppCredenciais("anuncios", "live")).toEqual({ partnerId: undefined, partnerKey: undefined });
  });
});
