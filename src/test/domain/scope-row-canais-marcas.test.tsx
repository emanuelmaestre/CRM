import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ScopeRow,
  type CardFiltro,
  type ScopeCanal,
  type ScopeMarca,
} from "@/app/(dashboard)/metricas/painel/scope-row";

const marcas: ScopeMarca[] = [
  { brandId: "karzi-id", nome: "KARZI", slug: "karzi", total: 10 },
  { brandId: "wuwu-id", nome: "WUWU", slug: "wuwu", total: 10 },
];

const canais: ScopeCanal[] = [
  { tipo: "mercadolivre", total: 10, conectado: true },
  { tipo: "shopee", total: 10, conectado: true },
];

function SeletorTeste() {
  const [filtro, setFiltro] = useState<CardFiltro>({ brandId: [], canal: [] });
  return <ScopeRow marcas={marcas} canais={canais} filtro={filtro} onChange={setFiltro} />;
}

describe("compatibilidade entre canais e marcas", () => {
  it("o canal nao acende empresa nenhuma — cada pilula liga so a si mesma", () => {
    render(<SeletorTeste />);

    const mercadoLivre = screen.getByRole("button", { name: "Mercado Livre" });
    const karzi = screen.getByRole("button", { name: "KARZI" });
    const wuwu = screen.getByRole("button", { name: "WUWU" });

    // Era aqui que o canal marcava as empresas dele sozinho. Nao marca mais:
    // escolher o Mercado Livre acende o Mercado Livre e mais nada.
    fireEvent.click(mercadoLivre);
    expect(mercadoLivre).toHaveAttribute("aria-pressed", "true");
    expect(karzi).toHaveAttribute("aria-pressed", "false");
    expect(wuwu).toHaveAttribute("aria-pressed", "false");

    // A empresa entra por clique proprio, uma de cada vez.
    fireEvent.click(karzi);
    expect(karzi).toHaveAttribute("aria-pressed", "true");
    expect(wuwu).toHaveAttribute("aria-pressed", "false");

    // E sai do mesmo jeito, sem levar a outra junto.
    fireEvent.click(wuwu);
    fireEvent.click(karzi);
    expect(karzi).toHaveAttribute("aria-pressed", "false");
    expect(wuwu).toHaveAttribute("aria-pressed", "true");
  });

  it("permite mais de uma empresa e mais de um canal ao mesmo tempo", () => {
    render(<SeletorTeste />);

    const mercadoLivre = screen.getByRole("button", { name: "Mercado Livre" });
    const shopee = screen.getByRole("button", { name: "Shopee" });
    const karzi = screen.getByRole("button", { name: "KARZI" });
    const wuwu = screen.getByRole("button", { name: "WUWU" });

    // "Selecao unica" e sobre o clique (cada um vale por si), nao sobre a
    // quantidade: os dois eixos seguem aceitando varios.
    fireEvent.click(mercadoLivre);
    fireEvent.click(shopee);
    fireEvent.click(karzi);
    fireEvent.click(wuwu);

    for (const pilula of [mercadoLivre, shopee, karzi, wuwu]) {
      expect(pilula).toHaveAttribute("aria-pressed", "true");
    }
  });

  it("poda a KARZI quando sobra apenas Shopee, canal onde ela nao opera", () => {
    render(<SeletorTeste />);

    const mercadoLivre = screen.getByRole("button", { name: "Mercado Livre" });
    const shopee = screen.getByRole("button", { name: "Shopee" });
    const karzi = screen.getByRole("button", { name: "KARZI" });

    // Com o Mercado Livre ligado, a KARZI entra normalmente.
    fireEvent.click(mercadoLivre);
    fireEvent.click(karzi);
    expect(karzi).toHaveAttribute("aria-pressed", "true");

    // Trocando para so Shopee ela sai sozinha — nao por auto-selecao, mas
    // porque ficaria marcada por tras de uma pilula travada, sem como
    // desmarcar.
    fireEvent.click(shopee);
    fireEvent.click(mercadoLivre);
    expect(karzi).toHaveAttribute("aria-pressed", "false");
    expect(karzi).toHaveAttribute("aria-disabled", "true");
    expect(karzi).toHaveAttribute("title", "KARZI não opera nos canais selecionados.");
  });
});
