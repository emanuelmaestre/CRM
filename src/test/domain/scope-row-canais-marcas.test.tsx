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
  it("seleciona KARZI com Mercado Livre e a bloqueia quando sobra apenas Shopee", () => {
    render(<SeletorTeste />);

    const mercadoLivre = screen.getByRole("button", { name: "Mercado Livre" });
    const shopee = screen.getByRole("button", { name: "Shopee" });
    const karzi = screen.getByRole("button", { name: "KARZI" });

    fireEvent.click(mercadoLivre);
    expect(karzi).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(shopee);
    fireEvent.click(mercadoLivre);
    expect(karzi).toHaveAttribute("aria-pressed", "false");
    expect(karzi).toHaveAttribute("aria-disabled", "true");
    expect(karzi).toHaveAttribute("title", "KARZI não opera nos canais selecionados.");
  });
});
