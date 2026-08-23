import { describe, expect, it } from "vitest";
import { BRAND_SLUGS, canaisDaMarca } from "@/shared/config/brands";
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
});
