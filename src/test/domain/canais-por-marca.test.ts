import { describe, expect, it } from "vitest";
import {
  BRAND_SLUGS,
  canaisDaMarca,
  empresaSemCanalEscolhido,
  marcaDisponivelNosCanais,
  marcasDosCanaisEscolhidos,
} from "@/shared/config/brands";
import { CANAIS_VENDA } from "@/shared/config/canais-venda";

describe("canais de venda por marca", () => {
  it("nao oferece Shopee para a KARZI, que nao vende nesse canal", () => {
    expect(canaisDaMarca("karzi")).not.toContain("shopee");
    expect(canaisDaMarca("karzi")).toEqual(["mercadolivre", "tiktokshop"]);
  });

  it("mantem Shopee nas marcas que realmente tem loja la", () => {
    expect(canaisDaMarca("wuwu")).toContain("shopee");
    expect(canaisDaMarca("armarinhos_lima")).toContain("shopee");
  });

  it("so devolve canais do conjunto fechado de canais de venda", () => {
    for (const slug of BRAND_SLUGS) {
      for (const canal of canaisDaMarca(slug)) {
        expect(CANAIS_VENDA).toContain(canal);
      }
    }
  });

  it("cai no conjunto completo para marca sem a chave declarada", () => {
    expect(canaisDaMarca("marca-inexistente")).toEqual(CANAIS_VENDA);
  });

  it("bloqueia a KARZI quando somente a Shopee esta selecionada", () => {
    expect(marcaDisponivelNosCanais("karzi", ["shopee"])).toBe(false);
    expect(marcaDisponivelNosCanais("karzi", ["mercadolivre", "shopee"])).toBe(true);
    expect(marcaDisponivelNosCanais("karzi", [])).toBe(true);
  });

  it("escolher um canal acende as empresas que operam nele", () => {
    const marcas = [
      { id: "karzi-id", slug: "karzi" },
      { id: "wuwu-id", slug: "wuwu" },
    ];

    // Mercado Livre traz as duas: o canal e a porta de entrada da lista.
    expect(marcasDosCanaisEscolhidos(["mercadolivre"], marcas)).toEqual(["karzi-id", "wuwu-id"]);
    // Shopee acende so quem opera nela — a KARZI fica de fora.
    expect(marcasDosCanaisEscolhidos(["shopee"], marcas)).toEqual(["wuwu-id"]);
    // Uniao de canais: basta operar em um deles.
    expect(marcasDosCanaisEscolhidos(["mercadolivre", "shopee"], marcas)).toEqual(["karzi-id", "wuwu-id"]);
    // Sem canal nao sobra empresa marcada — empresa sem canal nao mostra dado.
    expect(marcasDosCanaisEscolhidos([], marcas)).toEqual([]);
  });
});

describe("empresa sem canal escolhido", () => {
  it("so bloqueia quando ha empresa marcada e nenhum canal", () => {
    expect(empresaSemCanalEscolhido(["karzi-id"], [])).toBe(true);
    // Canal sozinho continua sendo um recorte valido: um canal, com as
    // empresas que operam nele dentro.
    expect(empresaSemCanalEscolhido([], ["mercadolivre"])).toBe(false);
    expect(empresaSemCanalEscolhido(["karzi-id"], ["mercadolivre"])).toBe(false);
    // Nada marcado nao e "empresa sem canal" — e a tela limpa de sempre.
    expect(empresaSemCanalEscolhido([], [])).toBe(false);
  });

  it("le array e Set, que e como as telas guardam a selecao", () => {
    expect(empresaSemCanalEscolhido(new Set(["karzi-id"]), new Set())).toBe(true);
    expect(empresaSemCanalEscolhido(new Set(["karzi-id"]), ["shopee"])).toBe(false);
    expect(empresaSemCanalEscolhido([], new Set(["shopee"]))).toBe(false);
  });
});
