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
  it("Mercado Livre acende as empresas dele, e cada uma continua livre pra ligar e desligar", () => {
    render(<SeletorTeste />);

    const mercadoLivre = screen.getByRole("button", { name: "Mercado Livre" });
    const karzi = screen.getByRole("button", { name: "KARZI" });
    const wuwu = screen.getByRole("button", { name: "WUWU" });

    // O canal é a porta de entrada: escolhê-lo traz as empresas que operam
    // nele já marcadas.
    fireEvent.click(mercadoLivre);
    expect(karzi).toHaveAttribute("aria-pressed", "true");
    expect(wuwu).toHaveAttribute("aria-pressed", "true");

    // O ponto da reclamação antiga continua valendo: dá pra desmarcar uma
    // delas com o Mercado Livre ligado, e a outra fica.
    fireEvent.click(karzi);
    expect(karzi).toHaveAttribute("aria-pressed", "false");
    expect(wuwu).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(karzi);
    expect(karzi).toHaveAttribute("aria-pressed", "true");

    // Tirar o último canal apaga tudo: empresa sem canal não mostra dado.
    fireEvent.click(mercadoLivre);
    expect(karzi).toHaveAttribute("aria-pressed", "false");
    expect(wuwu).toHaveAttribute("aria-pressed", "false");
  });

  it("bloqueia a KARZI quando sobra apenas Shopee, canal onde ela nao opera", () => {
    render(<SeletorTeste />);

    const shopee = screen.getByRole("button", { name: "Shopee" });
    const karzi = screen.getByRole("button", { name: "KARZI" });
    const wuwu = screen.getByRole("button", { name: "WUWU" });

    fireEvent.click(shopee);
    // Shopee acende so quem opera nela.
    expect(wuwu).toHaveAttribute("aria-pressed", "true");
    expect(karzi).toHaveAttribute("aria-pressed", "false");
    expect(karzi).toHaveAttribute("aria-disabled", "true");
    expect(karzi).toHaveAttribute("title", "KARZI não opera nos canais selecionados.");
  });
});
