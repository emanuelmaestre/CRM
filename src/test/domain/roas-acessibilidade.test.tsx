import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Roas, situacaoRoas } from "@/app/(dashboard)/anuncios/roas";

/* Trava do achado A-01 da auditoria de front-end.

   --success e --destructive precisam atingir 4.5:1 contra o mesmo fundo, o
   que necessariamente os deixa com luminância parecida (1.31:1 entre si;
   ~1.1:1 sob deuteranopia). Ou seja: NENHUMA escolha de cor faz ROAS ser
   legível só pela cor. Se alguém "simplificar" este componente removendo a
   seta ou o texto alternativo, estes testes falham. */

describe("ROAS não depende só de cor", () => {
  it("acima do mínimo traz sinal não-cromático e descrição textual", () => {
    render(<Roas valor={2.4} minimo={1.5} />);
    expect(screen.getByText(/acima do mínimo sustentável/i)).toBeInTheDocument();
  });

  it("abaixo do mínimo traz sinal não-cromático e descrição textual", () => {
    render(<Roas valor={0.85} minimo={1.5} />);
    expect(screen.getByText(/abaixo do mínimo sustentável/i)).toBeInTheDocument();
  });

  it("renderiza um ícone além do número — cor nunca é o único portador", () => {
    const { container } = render(<Roas valor={0.85} minimo={1.5} />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("sem investimento não vira 'ROAS zero': explica que não há dado", () => {
    render(<Roas valor={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText(/ROAS não existe sem gasto/i)).toBeInTheDocument();
  });
});

describe("corte do ROAS é o break-even, não 1.00", () => {
  it("usa o mínimo da campanha quando ele existe", () => {
    // 1.2x seria "lucro" contra 1.00, mas a campanha só se paga a partir
    // de 2.5x — a leitura ingênua inverteria o sinal.
    expect(situacaoRoas(1.2, 2.5)).toBe("abaixo");
  });

  it("cai para 1.00 quando o custo do produto não está configurado", () => {
    expect(situacaoRoas(1.2, null)).toBe("acima");
    expect(situacaoRoas(0.8, null)).toBe("abaixo");
  });

  it("tem zona de limite em vez de virar a chave num centavo", () => {
    expect(situacaoRoas(2.0, 2.0)).toBe("no_limite");
    expect(situacaoRoas(2.1, 2.0)).toBe("no_limite");
    expect(situacaoRoas(2.5, 2.0)).toBe("acima");
  });

  it("sem valor é sem dado, nunca 'ruim'", () => {
    expect(situacaoRoas(null, 2.0)).toBe("sem_dado");
  });
});
