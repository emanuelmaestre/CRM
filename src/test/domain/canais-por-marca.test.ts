import { describe, expect, it } from "vitest";
import {
  BRAND_SLUGS,
  ajustarMarcasSelecionadasAosCanais,
  canaisDaMarca,
  marcaDisponivelNosCanais,
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

  it("nao marca empresa sozinha ao escolher um canal, so tira a incompativel", () => {
    const marcas = [
      { id: "karzi-id", slug: "karzi" },
      { id: "wuwu-id", slug: "wuwu" },
    ];

    // Mercado Livre nao acrescenta a KARZI: quem escolhe a empresa e o usuario.
    expect(ajustarMarcasSelecionadasAosCanais([], ["mercadolivre"], marcas)).toEqual([]);
    expect(ajustarMarcasSelecionadasAosCanais(["wuwu-id"], ["mercadolivre"], marcas)).toEqual(["wuwu-id"]);
    // KARZI selecionada continua selecionada com Mercado Livre, e da pra tirar.
    expect(ajustarMarcasSelecionadasAosCanais(["karzi-id"], ["mercadolivre"], marcas)).toEqual(["karzi-id"]);
    // Shopee, onde a KARZI nao opera, e o unico caso que remove.
    expect(ajustarMarcasSelecionadasAosCanais(["karzi-id", "wuwu-id"], ["shopee"], marcas)).toEqual(["wuwu-id"]);
  });
});
