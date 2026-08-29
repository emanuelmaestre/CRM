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

    // O canal acende as empresas que operam nele — as três, aqui.
    fireEvent.click(mercadoLivre);
    expect(mercadoLivre).toHaveAttribute("aria-pressed", "true");
    expect(karzi).toHaveAttribute("aria-pressed", "true");
    expect(armarinhos).toHaveAttribute("aria-pressed", "true");
    expect(wuwu).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Mostrando 30 de 65 anúncios")).toBeInTheDocument();

    // Desmarcar estreita: sobra a KARZI, com os 15 anúncios dela.
    fireEvent.click(armarinhos);
    fireEvent.click(wuwu);
    expect(karzi).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByText(/^Produto /)).toHaveLength(15);

    // E devolver Armarinhos Lima traz os 65 de volta.
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

    // A Shopee não acende a KARZI: ela não opera nesse canal.
    fireEvent.click(shopee);
    expect(karzi).toHaveAttribute("aria-disabled", "true");
    expect(karzi).toHaveAttribute("aria-pressed", "false");

    // Com o Mercado Livre junto ela volta a operar e acende.
    fireEvent.click(mercadoLivre);
    expect(karzi).toHaveAttribute("aria-pressed", "true");
    // E continua livre pra desligar e ligar de novo.
    fireEvent.click(karzi);
    expect(karzi).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(karzi);
    expect(karzi).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(mercadoLivre);
    expect(karzi).toHaveAttribute("aria-disabled", "true");
    expect(karzi).toHaveAttribute("aria-pressed", "false");
  });
});

/* Bug encontrado em 29/08/2026 olhando a tela em produção: o cabeçalho dizia
   "0 opiniões" e média "—" com 43 anúncios da Shopee carregados, um deles com
   127 opiniões e nota 4,8 exibida na própria linha.

   Causa: os dois canais gravam a distribuição por estrela com chaves
   diferentes no mesmo campo jsonb — o Mercado Livre usa `uma..cinco`, a Shopee
   usa "1".."5" — e a tela só sabia ler a forma do ML. Todo anúncio da Shopee
   entrava valendo zero, sem erro nenhum: nada quebrava, o número só estava
   errado. É o tipo de falha que sobrevive porque ninguém confere a soma. */
describe("distribuição de notas com os dois formatos de canal", () => {
  function comNiveis(niveis: unknown, canal: "mercadolivre" | "shopee"): Avaliacao {
    const [base] = itens(1, canal === "shopee" ? "wuwu" : "karzi", canal, 1);
    return { ...base, ratingLevels: niveis as Avaliacao["ratingLevels"] };
  }

  it("soma o formato da Shopee, que usa 1..5 em vez de uma..cinco", () => {
    render(<AvaliacoesCliente itensIniciais={[
      comNiveis({ "1": 0, "2": 0, "3": 1, "4": 0, "5": 3 }, "shopee"),
    ]} />);
    fireEvent.click(screen.getByRole("button", { name: "Shopee" }));

    expect(screen.getByText(/4 opiniões/)).toBeInTheDocument();
    expect(screen.queryByText(/0 opiniões/)).not.toBeInTheDocument();
  });

  it("continua somando o formato do Mercado Livre", () => {
    render(<AvaliacoesCliente itensIniciais={[
      comNiveis({ uma: 1, duas: 0, tres: 0, quatro: 0, cinco: 1 }, "mercadolivre"),
    ]} />);
    fireEvent.click(screen.getByRole("button", { name: "Mercado Livre" }));

    expect(screen.getByText(/2 opiniões/)).toBeInTheDocument();
  });

  it("soma os dois canais juntos sem perder nenhum lado", () => {
    render(<AvaliacoesCliente itensIniciais={[
      comNiveis({ "1": 0, "2": 0, "3": 0, "4": 0, "5": 3 }, "shopee"),
      comNiveis({ uma: 0, duas: 0, tres: 0, quatro: 0, cinco: 2 }, "mercadolivre"),
    ]} />);
    fireEvent.click(screen.getByRole("button", { name: "Shopee" }));
    fireEvent.click(screen.getByRole("button", { name: "Mercado Livre" }));

    expect(screen.getByText(/5 opiniões/)).toBeInTheDocument();
  });
});
