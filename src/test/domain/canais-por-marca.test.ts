import { describe, expect, it } from "vitest";
import {
  BRAND_SLUGS,
  canaisDaMarca,
  conviteDeEscopo,
  escopoIncompleto,
  marcaDisponivelNosCanais,
  oQueFaltaNoEscopo,
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

});

describe("escopo so abre com empresa E canal", () => {
  it("exige os dois lados: um sozinho nao abre a tela", () => {
    // Antes, canal sozinho abria (e acendia as empresas dele automaticamente).
    // Agora nao abre: o recorte tem que ser dito por inteiro.
    expect(escopoIncompleto([], ["mercadolivre"])).toBe(true);
    expect(escopoIncompleto(["karzi-id"], [])).toBe(true);
    expect(escopoIncompleto([], [])).toBe(true);
    expect(escopoIncompleto(["karzi-id"], ["mercadolivre"])).toBe(false);
  });

  it("aceita mais de uma empresa e mais de um canal ao mesmo tempo", () => {
    // A regra e "pelo menos um de cada", nao "exatamente um de cada": a
    // selecao segue sendo multipla nos dois eixos.
    expect(escopoIncompleto(["karzi-id", "wuwu-id"], ["mercadolivre", "shopee"])).toBe(false);
  });

  it("nomeia o que falta, para a tela poder pedir so isso", () => {
    expect(oQueFaltaNoEscopo([], ["mercadolivre"])).toBe("empresa");
    expect(oQueFaltaNoEscopo(["karzi-id"], [])).toBe("canal");
    expect(oQueFaltaNoEscopo([], [])).toBe("ambos");
    expect(oQueFaltaNoEscopo(["karzi-id"], ["mercadolivre"])).toBeNull();
  });

  it("le array e Set, que e como as telas guardam a selecao", () => {
    expect(escopoIncompleto(new Set(["karzi-id"]), new Set())).toBe(true);
    expect(escopoIncompleto(new Set(["karzi-id"]), ["shopee"])).toBe(false);
    expect(escopoIncompleto([], new Set(["shopee"]))).toBe(true);
  });

  it("da uma frase diferente para cada falta", () => {
    const frases = (["empresa", "canal", "ambos"] as const).map((f) => conviteDeEscopo(f).titulo);
    expect(new Set(frases).size).toBe(3);
    for (const frase of frases) expect(frase.length).toBeGreaterThan(0);
  });
});
