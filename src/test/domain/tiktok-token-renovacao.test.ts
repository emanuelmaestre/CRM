import { describe, expect, it } from "vitest";
import {
  expiracaoTikTokISO,
  tokenTikTokPrecisaRenovar,
  TIKTOK_TOKEN_REFRESH_MARGIN_MS,
} from "@/modules/canais/application/tiktok-token.service";

const AGORA = Date.parse("2026-09-02T12:00:00.000Z");

/* As três marcas ficaram com `expires_at` em 2083 porque o callback somava
   `access_token_expire_in` a `Date.now()`. O campo tem nome de duração mas é o
   instante de expiração em epoch de segundos: 1.788.992.101 é 09/09/2026, não
   "1,7 bilhão de segundos a partir de agora". Com a validade no ano 2083
   nenhuma renovação seria acionada e o token simplesmente sumiria em 7 dias. */
describe("prazo do token do TikTok Shop", () => {
  it("epoch absoluto é lido como instante, não como duração", () => {
    const epoch = Math.floor(Date.parse("2026-09-09T12:00:00.000Z") / 1000);
    expect(expiracaoTikTokISO(epoch, AGORA)).toBe("2026-09-09T12:00:00.000Z");
  });

  it("o valor real devolvido pelo TikTok não cai no ano 2083", () => {
    expect(expiracaoTikTokISO(1_788_992_101, AGORA).startsWith("2026-")).toBe(true);
  });

  it("duração curta continua sendo somada a agora", () => {
    expect(expiracaoTikTokISO(7 * 24 * 60 * 60, AGORA)).toBe("2026-09-09T12:00:00.000Z");
  });

  it("sem prazo declarado o token nasce vencido, para ser renovado na próxima passagem", () => {
    expect(expiracaoTikTokISO(undefined, AGORA)).toBe(new Date(AGORA).toISOString());
    expect(tokenTikTokPrecisaRenovar(expiracaoTikTokISO(undefined, AGORA), AGORA)).toBe(true);
  });
});

describe("seleção de tokens do TikTok para renovar", () => {
  const em = (ms: number) => new Date(AGORA + ms).toISOString();

  it("token dentro da margem de 24h entra na renovação", () => {
    expect(tokenTikTokPrecisaRenovar(em(TIKTOK_TOKEN_REFRESH_MARGIN_MS - 60_000), AGORA)).toBe(true);
  });

  it("token com folga além da margem fica de fora", () => {
    expect(tokenTikTokPrecisaRenovar(em(TIKTOK_TOKEN_REFRESH_MARGIN_MS + 60_000), AGORA)).toBe(false);
  });

  it("validade ausente ou ilegível conta como precisando renovar", () => {
    expect(tokenTikTokPrecisaRenovar(null, AGORA)).toBe(true);
    expect(tokenTikTokPrecisaRenovar("não é data", AGORA)).toBe(true);
  });
});
