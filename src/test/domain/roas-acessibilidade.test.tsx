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
  it("acima de 1.00x traz sinal não-cromático e descrição textual", () => {
    render(<Roas valor={2.4} />);
    expect(screen.getByText(/a mídia se pagou/i)).toBeInTheDocument();
  });

  it("abaixo de 1.00x traz sinal não-cromático e descrição textual", () => {
    render(<Roas valor={0.85} />);
    expect(screen.getByText(/a mídia não se pagou/i)).toBeInTheDocument();
  });

  it("renderiza um ícone além do número — cor nunca é o único portador", () => {
    const { container } = render(<Roas valor={0.85} />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("sem investimento não vira 'ROAS zero': explica que não há dado", () => {
    render(<Roas valor={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText(/ROAS não existe sem gasto/i)).toBeInTheDocument();
  });
});

describe("corte do ROAS é 1.00x — mídia se pagou ou não", () => {
  // O corte já foi o break-even (custo do produto + comissão), mais preciso
  // mas dependente de um custo que nunca existiu no sistema — sempre null,
  // então a régua nunca calculava. 1.00x é o que sobra de verdadeiro: "a
  // mídia se pagou", sem inventar uma precisão que os dados não sustentam.
  it("acima de 1.00x com folga é 'acima'", () => {
    expect(situacaoRoas(2.5)).toBe("acima");
  });

  it("abaixo de 1.00x com folga é 'abaixo'", () => {
    expect(situacaoRoas(0.5)).toBe("abaixo");
  });

  it("tem zona de limite em vez de virar a chave num centavo", () => {
    expect(situacaoRoas(1.0)).toBe("no_limite");
    expect(situacaoRoas(1.05)).toBe("no_limite");
    expect(situacaoRoas(1.2)).toBe("acima");
    expect(situacaoRoas(0.85)).toBe("abaixo");
  });

  it("sem valor é sem dado, nunca 'ruim'", () => {
    expect(situacaoRoas(null)).toBe("sem_dado");
  });
});
