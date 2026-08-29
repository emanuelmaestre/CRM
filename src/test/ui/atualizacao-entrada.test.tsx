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

type Situacao = "pronto" | "erro" | "pendente" | "atualizando";

function resposta(situacao: Situacao, progresso: number, extras: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({
    tela: "metricas",
    situacao,
    progresso,
    versao: "2026-08-29T13:32:00.000Z",
    versoes: { pedidos: "2026-08-29T13:32:00.000Z" },
    fontes: ["pedidos"],
    ...(situacao === "erro"
      ? { mensagem: "Não foi possível atualizar agora.", confirmadoAte: "2026-08-29T13:32:00.000Z" }
      : {}),
    ...extras,
  }), { status: 200, headers: { "content-type": "application/json" } });
}

function metodos(mock: ReturnType<typeof vi.fn>): string[] {
  return mock.mock.calls.map(([, init]) => (init as RequestInit | undefined)?.method ?? "GET");
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

  /* A regressão que este teste protege: falha de canal cobria a tela inteira e
     não sobrava nada — nem o dado do outro canal, nem a navegação, porque o
     bloqueio também deixava o menu inerte. Um canal fora do ar parava a
     operação inteira. */
  it("na falha revela o conteúdo com a hora do dado, em vez de esconder tudo", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(resposta("erro", 42)));

    render(<AtualizacaoProvider><p>R$ 1.234,00</p></AtualizacaoProvider>);

    await waitFor(() => expect(screen.getByText("R$ 1.234,00").parentElement).toHaveAttribute("aria-hidden", "false"));
    expect(screen.getByText(/Não foi possível confirmar agora/)).toBeInTheDocument();
    // 13h32 UTC é 10h32 em São Paulo: a tarja fala a hora de quem lê a tela.
    expect(screen.getByText("10h32")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
  });

  it("tentar novamente refaz a confirmação e tira a tarja quando dá certo", async () => {
    const buscar = vi.fn()
      .mockResolvedValueOnce(resposta("erro", 42))
      .mockResolvedValue(resposta("pronto", 100));
    vi.stubGlobal("fetch", buscar);

    render(<AtualizacaoProvider><p>Faturamento</p></AtualizacaoProvider>);

    await screen.findByRole("button", { name: "Tentar novamente" });
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));

    await waitFor(() => expect(screen.queryByText(/Não foi possível confirmar agora/)).not.toBeInTheDocument());
    expect(metodos(buscar)).toEqual(["POST", "POST"]);
  });

  /* Só a ENTRADA manda confirmar. Enquanto a tela fica aberta o relógio
     continua rodando, mas como leitura: um POST a cada volta transformaria
     uma tela aberta a tarde inteira em uma sincronização a cada cinco
     minutos, que é exatamente a conta de cota que se quer evitar. */
  it("confirma no máximo duas vezes por entrada e libera a tela se insistir em pendente", async () => {
    const buscar = vi.fn().mockResolvedValue(resposta("pendente", 10));
    vi.stubGlobal("fetch", buscar);

    render(<AtualizacaoProvider><p>Faturamento</p></AtualizacaoProvider>);

    await waitFor(() => expect(screen.getByText("Faturamento").parentElement).toHaveAttribute("aria-hidden", "false"));
    expect(metodos(buscar).filter((metodo) => metodo === "POST")).toHaveLength(2);
    expect(screen.getByText(/Não foi possível confirmar/)).toBeInTheDocument();
  });

  it("fora dos módulos com canal não bloqueia nem consulta nada", () => {
    const buscar = vi.fn();
    vi.stubGlobal("fetch", buscar);
    navegacao.pathname = "/configuracoes";

    render(<AtualizacaoProvider><p>Central</p></AtualizacaoProvider>);

    expect(screen.getByText("Central")).toBeInTheDocument();
    expect(buscar).not.toHaveBeenCalled();
    navegacao.pathname = "/metricas";
  });
});
