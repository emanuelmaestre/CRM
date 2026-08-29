import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navegacao = vi.hoisted(() => ({
  pathname: "/metricas",
  router: { refresh: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navegacao.pathname,
  useRouter: () => navegacao.router,
}));

vi.mock("@/shared/lib/atualizacao-local", () => ({
  emitirAtualizacaoLocal: vi.fn(),
}));

const { AtualizacaoProvider } = await import("@/shared/components/atualizacao/atualizacao-contexto");

function resposta(situacao: "pronto" | "erro", progresso: number) {
  return new Response(JSON.stringify({
    tela: "metricas",
    situacao,
    progresso,
    versao: "2026-08-29T12:00:00.000Z",
    versoes: { pedidos: "2026-08-29T12:00:00.000Z" },
    fontes: ["pedidos"],
    ...(situacao === "erro" ? { mensagem: "Não foi possível atualizar agora." } : {}),
  }), { status: 200, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("confirmação inteligente na entrada dos módulos", () => {
  it("mantém o conteúdo inerte até a confirmação e o libera quando fica pronto", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(resposta("pronto", 100)));

    render(<AtualizacaoProvider><p>R$ 1.234,00</p></AtualizacaoProvider>);

    expect(screen.getByText("R$ 1.234,00").parentElement).toHaveAttribute("aria-hidden", "true");
    await waitFor(() => expect(screen.getByText("R$ 1.234,00").parentElement).toHaveAttribute("aria-hidden", "false"));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("mostra somente a falha curta e permite tentar de novo", async () => {
    const buscar = vi.fn()
      .mockResolvedValueOnce(resposta("erro", 42))
      .mockResolvedValueOnce(resposta("pronto", 100));
    vi.stubGlobal("fetch", buscar);

    render(<AtualizacaoProvider><p>Dados antigos</p></AtualizacaoProvider>);

    expect(await screen.findByText("Não foi possível atualizar agora.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));

    await waitFor(() => expect(screen.queryByText("Não foi possível atualizar agora.")).not.toBeInTheDocument());
    expect(buscar).toHaveBeenCalledTimes(2);
  });
});
