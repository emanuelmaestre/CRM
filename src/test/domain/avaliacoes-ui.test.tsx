import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AvaliacoesCliente } from "@/app/(dashboard)/avaliacoes/avaliacoes-cliente";
import type { Avaliacao } from "@/app/(dashboard)/avaliacoes/avaliacoes-lista";

function itens(quantidade: number, brand: string, canal: "mercadolivre" | "shopee", inicio: number): Avaliacao[] {
  return Array.from({ length: quantidade }, (_, indice) => ({
    listingId: `${canal}-${inicio + indice}`,
    title: `Produto ${inicio + indice}`,
    permalink: null,
    ratingAverage: 5,
    reviewsTotal: 1,
    ratingLevels: { uma: 0, duas: 0, tres: 0, quatro: 0, cinco: 1 },
    opinioes: [],
    brand,
    brandLabel: brand,
    canal,
  }));
}

describe("filtros de Avaliações", () => {
  it("responde aos filtros sem montar centenas de anúncios de uma vez", () => {
    render(<AvaliacoesCliente itensIniciais={[
      ...itens(50, "armarinhos_lima", "mercadolivre", 0),
      ...itens(20, "wuwu", "shopee", 100),
      ...itens(15, "karzi", "mercadolivre", 200),
    ]} />);

    const mercadoLivre = screen.getByRole("button", { name: "Mercado Livre" });
    const shopee = screen.getByRole("button", { name: "Shopee" });
    const armarinhos = screen.getByRole("button", { name: /Armarinhos Lima/i });
    const karzi = screen.getByRole("button", { name: /Karzi/i });
    const wuwu = screen.getByRole("button", { name: /Wuwu/i });

    for (const filtro of [mercadoLivre, shopee, armarinhos, karzi, wuwu]) {
      expect(filtro).toBeEnabled();
    }

    fireEvent.click(mercadoLivre);
    expect(mercadoLivre).toHaveAttribute("aria-pressed", "true");
    expect(karzi).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByText(/^Produto /)).toHaveLength(15);

    fireEvent.click(armarinhos);
    expect(armarinhos).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Mostrando 30 de 65 anúncios")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ver mais 30" }));
    expect(screen.getByText("Mostrando 60 de 65 anúncios")).toBeInTheDocument();
    expect(screen.getAllByText(/^Produto /)).toHaveLength(60);
  }, 15_000);

  it("mantém TikTok tocável para explicar que avaliações ainda não estão disponíveis", () => {
    render(<AvaliacoesCliente itensIniciais={itens(1, "armarinhos_lima", "mercadolivre", 0)} />);
    const tiktok = screen.getByRole("button", { name: /TikTok Shop — ainda não disponível/i });
    expect(tiktok).toBeEnabled();
    expect(tiktok).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(tiktok);
    expect(tiktok).toHaveAttribute("aria-pressed", "false");
  });

  it("bloqueia a KARZI quando somente a Shopee esta ativa", () => {
    render(<AvaliacoesCliente itensIniciais={[
      ...itens(1, "karzi", "mercadolivre", 0),
      ...itens(1, "wuwu", "shopee", 10),
    ]} />);

    const mercadoLivre = screen.getByRole("button", { name: "Mercado Livre" });
    const shopee = screen.getByRole("button", { name: "Shopee" });
    const karzi = screen.getByRole("button", { name: /Karzi/i });

    fireEvent.click(shopee);
    expect(karzi).toHaveAttribute("aria-disabled", "true");
    expect(karzi).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(mercadoLivre);
    expect(karzi).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(mercadoLivre);
    expect(karzi).toHaveAttribute("aria-disabled", "true");
    expect(karzi).toHaveAttribute("aria-pressed", "false");
  });
});
