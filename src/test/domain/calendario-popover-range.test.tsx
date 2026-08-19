import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { CalendarioPopoverRange } from "@/shared/design-system/primitives/CalendarioPopoverRange";

/* Smoke test do calendário de intervalo que substituiu o par "De:"/"Até:" de
   dois `CalendarioPopover` — um clique fixa o início, o próximo fecha o fim
   e já aplica o filtro (sem botão "aplicar"), com um pulso de confirmação
   antes do painel fechar sozinho. Sem isso, um popover com bug de interação
   só apareceria em produção — não há erro de tipo nem de lint que pegue
   "o segundo clique não fechou o intervalo". */

describe("CalendarioPopoverRange", () => {
  // Sem intervalo selecionado, o popover abre no mês de "hoje" — fixar o
  // relógio evita que o teste vire flaky dependendo de que dia rodar.
  beforeEach(() => vi.useFakeTimers({ now: new Date(2026, 7, 15) }));
  afterEach(() => vi.useRealTimers());

  it("primeiro clique fixa o início, segundo clique fecha o fim e aplica o filtro", () => {
    const onChange = vi.fn();
    render(<CalendarioPopoverRange rotulo="Período" valor={{ inicio: "", fim: "" }} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Período" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/agosto de 2026/i)).toBeInTheDocument();

    fireEvent.click(document.querySelector('[data-date="2026-08-10"]') as HTMLElement);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/agora escolha a data final/i)).toBeInTheDocument();

    fireEvent.click(document.querySelector('[data-date="2026-08-20"]') as HTMLElement);
    expect(onChange).toHaveBeenCalledWith({ inicio: "2026-08-10", fim: "2026-08-20" });

    // O painel some sozinho depois do pulso de confirmação, não no instante
    // do clique — é o que dá o feedback de "aplicado e carregado". Ele sai
    // por trás de uma animação de saída (AnimatePresence), então o que o
    // pulso garante é o estado fechado, não a ausência imediata do nó.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(400));
    expect(screen.getByRole("dialog")).toHaveStyle({ opacity: "0" });
  });

  it("escolher o fim antes do início inverte as datas automaticamente", () => {
    const onChange = vi.fn();
    render(<CalendarioPopoverRange rotulo="Período" valor={{ inicio: "", fim: "" }} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Período" }));

    fireEvent.click(document.querySelector('[data-date="2026-08-20"]') as HTMLElement);
    fireEvent.click(document.querySelector('[data-date="2026-08-10"]') as HTMLElement);

    expect(onChange).toHaveBeenCalledWith({ inicio: "2026-08-10", fim: "2026-08-20" });
  });

  it("bloqueia dias fora do intervalo min/max", () => {
    const onChange = vi.fn();
    render(
      <CalendarioPopoverRange rotulo="Período" valor={{ inicio: "", fim: "" }} min="2026-08-10" max="2026-08-20" onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Período" }));

    const diaBloqueado = document.querySelector('[data-date="2026-08-05"]') as HTMLButtonElement;
    expect(diaBloqueado).toBeDisabled();

    fireEvent.click(diaBloqueado);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('"Limpar" esvazia o valor e fecha o painel', () => {
    const onChange = vi.fn();
    render(<CalendarioPopoverRange rotulo="Período" valor={{ inicio: "2026-08-10", fim: "2026-08-20" }} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /10 de ago.*20 de ago/i }));

    fireEvent.click(screen.getByRole("button", { name: "Limpar" }));
    expect(onChange).toHaveBeenCalledWith({ inicio: "", fim: "" });
    expect(screen.getByRole("dialog")).toHaveStyle({ opacity: "0" });
  });

  it('atalho "Hoje" aplica o dia atual como início e fim', () => {
    const onChange = vi.fn();
    render(<CalendarioPopoverRange rotulo="Período" valor={{ inicio: "", fim: "" }} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Período" }));

    fireEvent.click(screen.getByRole("button", { name: "Hoje" }));
    expect(onChange).toHaveBeenCalledWith({ inicio: "2026-08-15", fim: "2026-08-15" });
  });
});
