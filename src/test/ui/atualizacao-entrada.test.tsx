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
const { marcarEntradaPosLogin, limparEntradaPosLogin } =
  await import("@/shared/lib/auth/entrada-pos-login");

type Situacao = "pronto" | "erro" | "pendente" | "atualizando";

/* A tarja mostra só a HORA quando o dado é de hoje e acrescenta a data quando
   não é. Com um carimbo fixo no calendário, o teste passava no dia em que foi
   escrito e ficava vermelho no dia seguinte — foi o que aconteceu com
   29/08/2026, que virou "29/08/2026 10h32" em vez de "10h32". O carimbo agora
   é sempre hoje às 13h32 UTC, que é 10h32 em São Paulo o ano inteiro (o
   Brasil não tem mais horário de verão). */
const HOJE_EM_SAO_PAULO = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const CARIMBO = `${HOJE_EM_SAO_PAULO}T13:32:00.000Z`;

function resposta(situacao: Situacao, progresso: number, extras: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({
    tela: "metricas",
    situacao,
    progresso,
    versao: CARIMBO,
    versoes: { pedidos: CARIMBO },
    fontes: ["pedidos"],
    ...(situacao === "erro"
      ? {
        mensagem: "Não foi possível atualizar agora.",
        confirmadoAte: CARIMBO,
        canais: ["Mercado Livre"],
      }
      : {}),
    ...extras,
  }), { status: 200, headers: { "content-type": "application/json" } });
}

function metodos(mock: ReturnType<typeof vi.fn>): string[] {
  return mock.mock.calls.map(([, init]) => (init as RequestInit | undefined)?.method ?? "GET");
}

beforeEach(() => {
  vi.clearAllMocks();
  limparEntradaPosLogin();
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
    expect(screen.getByText(/Mostrando os dados de/)).toBeInTheDocument();
    // 13h32 UTC é 10h32 em São Paulo: a tarja fala a hora de quem lê a tela.
    expect(screen.getByText("10h32")).toBeInTheDocument();
    // Quem não respondeu, pelo nome: "não deu" sozinho não diz se a tela
    // inteira está velha ou só a metade de um canal.
    expect(screen.getByText("Mercado Livre não respondeu.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Tentar novamente/ })).toBeInTheDocument();
  });

  /* A regressão seguinte: retentar zerava a entrada e a cobertura em tela
     cheia voltava por cima de tudo. Quem clicava perdia a tela que estava
     lendo para esperar de novo o mesmo canal que acabara de falhar. */
  it("tentar novamente confirma por baixo, sem voltar a cobrir a tela", async () => {
    const buscar = vi.fn()
      .mockResolvedValueOnce(resposta("erro", 42))
      .mockResolvedValue(resposta("pronto", 100));
    vi.stubGlobal("fetch", buscar);

    render(<AtualizacaoProvider><p>Faturamento</p></AtualizacaoProvider>);

    await screen.findByRole("button", { name: /Tentar novamente/ });
    fireEvent.click(screen.getByRole("button", { name: /Tentar novamente/ }));

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getByText("Faturamento").parentElement).toHaveAttribute("aria-hidden", "false");

    await waitFor(() => expect(screen.queryByText(/Mostrando os dados de/)).not.toBeInTheDocument());
    expect(metodos(buscar)).toEqual(["POST", "POST"]);
  });

  /* O servidor recusa nova verificação dentro do intervalo mínimo. Sem o
     prazo na tela, "Tentar novamente" é uma promessa que só sabe falhar — a
     pessoa clica até desistir e nada muda. */
  it("desliga o botão enquanto o intervalo mínimo do canal não vence", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      resposta("erro", 42, { esperarSegundos: 184 }),
    ));

    render(<AtualizacaoProvider><p>Faturamento</p></AtualizacaoProvider>);

    const botao = await screen.findByRole("button", { name: /Em 3:0/ });
    expect(botao).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Tentar novamente/ })).not.toBeInTheDocument();
  });

  it("a tarja pode ser dispensada sem parar a confirmação em segundo plano", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(resposta("erro", 42)));

    render(<AtualizacaoProvider><p>Faturamento</p></AtualizacaoProvider>);

    await screen.findByRole("button", { name: /Tentar novamente/ });
    fireEvent.click(screen.getByRole("button", { name: "Dispensar o aviso" }));

    await waitFor(() => expect(screen.queryByText(/Mostrando os dados de/)).not.toBeInTheDocument());
    expect(screen.getByText("Faturamento").parentElement).toHaveAttribute("aria-hidden", "false");
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
    expect(screen.getByText(/Os canais não responderam/)).toBeInTheDocument();
  });

  /* A queixa que originou isto: o contador em tela cheia aparecia logo depois
     da senha e era lido como "o login travou". A confirmação continua
     acontecendo — ela só deixa de ser pedágio nessa primeira tela. */
  it("não cobre a tela quando a entrada veio do login, mas ainda confirma", async () => {
    const buscar = vi.fn().mockResolvedValue(resposta("pendente", 10));
    vi.stubGlobal("fetch", buscar);
    marcarEntradaPosLogin();

    render(<AtualizacaoProvider><p>Faturamento</p></AtualizacaoProvider>);

    expect(screen.getByText("Faturamento").parentElement).toHaveAttribute("aria-hidden", "false");
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    await waitFor(() => expect(buscar).toHaveBeenCalled());
    expect(metodos(buscar)[0]).toBe("POST");
  });

  it("a dispensa vale só para a primeira tela: a seguinte volta a ter o portão", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(resposta("pendente", 10)));
    marcarEntradaPosLogin();

    const { unmount } = render(<AtualizacaoProvider><p>Faturamento</p></AtualizacaoProvider>);
    expect(screen.getByText("Faturamento").parentElement).toHaveAttribute("aria-hidden", "false");
    unmount();

    // Nova montagem do painel, já sem a marca: o portão cobre de novo.
    render(<AtualizacaoProvider><p>Estoque</p></AtualizacaoProvider>);
    expect(screen.getByText("Estoque").parentElement).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
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
