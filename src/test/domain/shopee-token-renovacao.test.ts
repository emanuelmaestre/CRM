import { describe, expect, it } from "vitest";
import { escolherAccessTokenShopee } from "@/modules/canais/infrastructure/shopee.provider";

const AGORA = Date.parse("2026-08-27T12:00:00.000Z");
const em = (segundos: number) => new Date(AGORA + segundos * 1000).toISOString();

/* A sincronização de 1073 pedidos da WUWU morreu duas vezes em 27/08/2026 com
   "token OAuth expirado" — sempre no minuto em que o A33 renovava. O token
   estava válido; a margem de 60s é que era tratada como vencimento, e aí o
   código só aceitava SHOPEE_ACCESS_TOKEN_*, que é placeholder e está vazio. */
describe("escolha do access token da Shopee na janela de renovação", () => {
  it("token que ainda vale 30s é USADO quando não há token de ambiente", () => {
    const r = escolherAccessTokenShopee("do-banco", em(30), undefined, AGORA);
    expect(r.accessToken).toBe("do-banco");
    expect(r.tokenBancoVencido).toBe(false);
  });

  it("dentro da margem, o do ambiente tem preferência quando existe", () => {
    const r = escolherAccessTokenShopee("do-banco", em(30), "do-ambiente", AGORA);
    expect(r.accessToken).toBe("do-ambiente");
  });

  it("token vencido de fato é recusado e cai no ambiente", () => {
    expect(escolherAccessTokenShopee("do-banco", em(-1), "do-ambiente", AGORA).accessToken).toBe("do-ambiente");
    expect(escolherAccessTokenShopee("do-banco", em(-1), "do-ambiente", AGORA).tokenBancoVencido).toBe(true);
  });

  it("vencido e sem ambiente devolve indefinido — quem chama lança", () => {
    const r = escolherAccessTokenShopee("do-banco", em(-1), undefined, AGORA);
    expect(r.accessToken).toBeUndefined();
    expect(r.tokenBancoVencido).toBe(true);
  });

  it("token folgado usa o banco, ignorando o ambiente", () => {
    expect(escolherAccessTokenShopee("do-banco", em(3600), "do-ambiente", AGORA).accessToken).toBe("do-banco");
  });

  it("sem vencimento declarado, o banco vale", () => {
    expect(escolherAccessTokenShopee("do-banco", undefined, undefined, AGORA).accessToken).toBe("do-banco");
  });
});
