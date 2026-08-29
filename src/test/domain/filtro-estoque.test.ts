import { describe, expect, it } from "vitest";
import {
  canaisDaUrl, filtroDaUrl, linkParaEstoque, marcasDaUrl,
} from "@/app/(dashboard)/estoque/filtro-estoque";

describe("recorte do Estoque vindo da URL", () => {
  it("aceita os recortes que a tela sabe aplicar", () => {
    expect(filtroDaUrl("parados")).toBe("parados");
    expect(filtroDaUrl("abaixo_minimo")).toBe("abaixo_minimo");
  });

  /* A URL é digitável e o `?filtro=` ainda atravessa o login e volta. Valor
     desconhecido não pode virar um filtro que a tela não sabe aplicar. */
  it.each(["inventado", "", undefined, "PARADOS"])("recusa %j e cai em todos", (valor) => {
    expect(filtroDaUrl(valor as string | undefined)).toBe("todos");
  });
});

describe("escopo vindo da URL", () => {
  it("lê marcas por slug, sem duplicar e sem caixa alta", () => {
    expect(marcasDaUrl("karzi, WUWU ,karzi")).toEqual(["karzi", "wuwu"]);
    expect(marcasDaUrl(undefined)).toEqual([]);
    expect(marcasDaUrl("")).toEqual([]);
  });

  it("descarta canal que não existe", () => {
    expect(canaisDaUrl("shopee,tiktokshop,amazon")).toEqual(["shopee", "tiktokshop"]);
    expect(canaisDaUrl("nenhum")).toEqual([]);
  });

  /* Sem teto, um `?marcas=` com mil valores vira mil comparações e um IN
     gigante no banco por conta de quem montou o endereço. */
  it("limita quantos itens aceita da URL", () => {
    const muitas = Array.from({ length: 200 }, (_, n) => `marca-${n}`).join(",");
    expect(marcasDaUrl(muitas).length).toBeLessThanOrEqual(24);
  });
});

describe("link do \"Ver todos no Estoque\"", () => {
  /* A regressão que este teste protege: o link saía só com `?filtro=`, e
     recorte sozinho não abre lista no Estoque — lá o escopo é empresa e
     canal. A pessoa clicava e caía no convite "escolha uma empresa", com o
     recorte aplicado e invisível. */
  it("leva o escopo junto do recorte", () => {
    const href = linkParaEstoque({
      filtro: "parados",
      marcas: ["karzi", "wuwu"],
      canais: ["shopee"],
    });
    expect(href).toBe("/estoque?filtro=parados&marcas=karzi%2Cwuwu&canais=shopee");
  });

  it("o que sai do link é exatamente o que a leitura devolve", () => {
    const href = linkParaEstoque({
      filtro: "abaixo_minimo",
      marcas: ["armarinhos-lima"],
      canais: ["mercadolivre", "shopee"],
    });
    const query = new URLSearchParams(href.split("?")[1]);

    expect(filtroDaUrl(query.get("filtro") ?? undefined)).toBe("abaixo_minimo");
    expect(marcasDaUrl(query.get("marcas") ?? undefined)).toEqual(["armarinhos-lima"]);
    expect(canaisDaUrl(query.get("canais") ?? undefined)).toEqual(["mercadolivre", "shopee"]);
  });

  it("sem escopo e sem recorte, aponta para a tela limpa", () => {
    expect(linkParaEstoque({ filtro: "todos" })).toBe("/estoque");
  });

  it("omite o que está vazio em vez de mandar parâmetro solto", () => {
    expect(linkParaEstoque({ filtro: "parados", marcas: [], canais: [] }))
      .toBe("/estoque?filtro=parados");
  });
});
