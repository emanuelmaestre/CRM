import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CalendarioPopover } from "@/shared/design-system/primitives/CalendarioPopover";

/* Smoke test do calendário próprio que substituiu o <input type="date">
   nativo: abre, mostra o mês certo, navega, escolhe um dia e respeita os
   limites min/max. Sem isso, um popover com bug de interação só apareceria
   em produção — não há erro de tipo nem de lint que pegue "o clique não fez
   nada". */

describe("CalendarioPopover", () => {
  // Sem data selecionada, o popover abre no mês de "hoje" — fixar o relógio
  // evita que o teste vire flaky dependendo de que dia rodar.
  beforeEach(() => vi.setSystemTime(new Date(2026, 7, 15)));
  afterEach(() => vi.useRealTimers());

  it("abre ao clicar, mostra o mês da data selecionada e fecha ao escolher um dia", () => {
    const onChange = vi.fn();
    render(<CalendarioPopover rotulo="De:" valor="2026-08-15" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /de: 15\/08\/2026/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/agosto de 2026/i)).toBeInTheDocument();

    fireEvent.click(document.querySelector('[data-date="2026-08-20"]') as HTMLElement);
    expect(onChange).toHaveBeenCalledWith("2026-08-20");
    // O diálogo some por trás de uma animação de saída (AnimatePresence) — o
    // que a escolha do dia garante de imediato é o estado fechado, não a
    // ausência do nó no DOM antes da transição terminar.
    expect(screen.getByRole("dialog")).toHaveStyle({ opacity: "0" });
  });

  it("navega entre meses sem alterar a data selecionada", () => {
    const onChange = vi.fn();
    render(<CalendarioPopover rotulo="De:" valor="" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "De:" }));

    const tituloAntes = screen.getByRole("dialog").querySelector("span")?.textContent;
    fireEvent.click(screen.getByRole("button", { name: /próximo mês/i }));
    const tituloDepois = screen.getByRole("dialog").querySelector("span")?.textContent;

    expect(tituloDepois).not.toBe(tituloAntes);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("bloqueia dias fora do intervalo min/max", () => {
    const onChange = vi.fn();
    render(
      <CalendarioPopover rotulo="Até:" valor="" min="2026-08-10" max="2026-08-20" onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Até:" }));

    const diaBloqueado = document.querySelector('[data-date="2026-08-05"]') as HTMLButtonElement;
    expect(diaBloqueado).toBeDisabled();

    fireEvent.click(diaBloqueado);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('"Limpar" esvazia o valor e "Hoje" seleciona a data atual quando permitido', () => {
    const onChange = vi.fn();
    render(<CalendarioPopover rotulo="De:" valor="2026-08-15" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /de: 15\/08\/2026/i }));

    fireEvent.click(screen.getByRole("button", { name: "Hoje" }));
    expect(onChange).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /de: 15\/08\/2026/i }));
    fireEvent.click(screen.getByRole("button", { name: "Limpar" }));
    expect(onChange).toHaveBeenLastCalledWith("");
  });

  it("alinha o painel pela direita quando o gatilho fica no canto direito", () => {
    render(<CalendarioPopover rotulo="Até:" valor="2026-08-15" onChange={vi.fn()} />);
    const gatilho = screen.getByRole("button", { name: /até: 15\/08\/2026/i });
    vi.spyOn(gatilho, "getBoundingClientRect").mockReturnValue({
      x: 960, y: 100, left: 960, right: 1000, top: 100, bottom: 140,
      width: 40, height: 40, toJSON: () => ({}),
    });

    fireEvent.click(gatilho);

    expect(screen.getByRole("dialog")).toHaveStyle({ left: "712px" });
  });
});
