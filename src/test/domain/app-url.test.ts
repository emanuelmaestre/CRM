import { describe, expect, it } from "vitest";
import {
  APP_URL_PRODUCAO,
  obterAppUrl,
  obterUrlCallbackMercadoLivre,
} from "@/shared/config/app-url";

describe("identidade pública da aplicação", () => {
  it("usa Elisa Lima como domínio canônico de produção", () => {
    expect(APP_URL_PRODUCAO).toBe("https://elisa-lima.vercel.app");
    expect(obterAppUrl(undefined)).toBe(APP_URL_PRODUCAO);
  });

  it("normaliza a barra final antes de montar o callback do Mercado Livre", () => {
    expect(obterAppUrl(" https://elisa-lima.vercel.app/// ")).toBe("https://elisa-lima.vercel.app");
    expect(obterUrlCallbackMercadoLivre("https://elisa-lima.vercel.app/"))
      .toBe("https://elisa-lima.vercel.app/api/ml/callback");
  });
});
