import { describe, expect, it } from "vitest";
import { DESTINO_PADRAO_POS_LOGIN, destinoSeguroPosLogin } from "@/shared/lib/auth/destino-pos-login";

describe("destino depois do login", () => {
  it("preserva o caminho com a query — é o recorte que o link pedia", () => {
    expect(destinoSeguroPosLogin("/estoque?filtro=parados")).toBe("/estoque?filtro=parados");
  });

  it("aceita caminho interno simples", () => {
    expect(destinoSeguroPosLogin("/vendas/pedidos")).toBe("/vendas/pedidos");
  });

  /* `next` chega pela URL, montada por quem quiser. Sem esta trava, a tela de
     login viraria trampolim para fora logo depois de a pessoa digitar a
     senha. */
  it.each([
    "https://exemplo-invasor.test",
    "//exemplo-invasor.test",
    "/\\exemplo-invasor.test",
    "javascript:alert(1)",
    "",
    null,
    undefined,
  ])("recusa %j e cai no padrão", (valor) => {
    expect(destinoSeguroPosLogin(valor as string | null | undefined)).toBe(DESTINO_PADRAO_POS_LOGIN);
  });

  it("não devolve a própria tela de login", () => {
    expect(destinoSeguroPosLogin("/auth/login")).toBe(DESTINO_PADRAO_POS_LOGIN);
    expect(destinoSeguroPosLogin("/auth/login?next=/estoque")).toBe(DESTINO_PADRAO_POS_LOGIN);
  });

  it("recusa caractere de controle usado para burlar a leitura", () => {
    expect(destinoSeguroPosLogin("/\tjavascript:alert(1)")).toBe(DESTINO_PADRAO_POS_LOGIN);
  });

  /* O proxy resolve o destino contra a origem da requisição para montar o
     redirect de quem já tem sessão. A trava só vale se, seja qual for o
     `next`, o endereço final continuar sendo o nosso servidor. */
  it.each([
    "/estoque?filtro=parados",
    "//exemplo-invasor.test",
    "/\\exemplo-invasor.test",
    "https://exemplo-invasor.test/roubo",
    "/../fora",
  ])("resolvido contra a origem, %j não sai do nosso domínio", (valor) => {
    const origem = "https://elisa-lima.vercel.app";
    expect(new URL(destinoSeguroPosLogin(valor), origem).origin).toBe(origem);
  });
});
