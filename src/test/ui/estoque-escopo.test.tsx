import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import pagesConfig from "@/config/pages.json";

/* A tela de Estoque abre sem escopo e permite marcar uma, duas ou as três
   empresas ao mesmo tempo — mesma coisa para os canais. Como isso é uma regra
   de comportamento (e não de layout), dá para travá-la sem browser nem banco —
   o que importa é o que aparece antes e depois de cada clique. */

const MARCAS = [
  { brandId: "10000000-0000-4000-8000-000000000001", name: "KARZI", slug: "karzi", total: 312 },
  { brandId: "10000000-0000-4000-8000-000000000002", name: "WUWU", slug: "wuwu", total: 148 },
  { brandId: "10000000-0000-4000-8000-000000000003", name: "ARMARINHOS LIMA", slug: "armarinhos_lima", total: 0 },
];

const CANAIS = [
  { tipo: "mercadolivre" as const, conectado: true, total: 460 },
  { tipo: "shopee" as const, conectado: false, total: 0 },
  { tipo: "tiktokshop" as const, conectado: false, total: 0 },
];

const CANAIS_COM_SHOPEE = CANAIS.map((canal) =>
  canal.tipo === "shopee" ? { ...canal, conectado: true, total: 90 } : canal);

function produtoDe(brandId: string, sku: string, nome: string, slug: string, marca: string) {
  return {
    id: `p-${sku}`, sku, nome, preco: "19.90",
    estoqueMinimo: 0, brandId, brandName: marca, brandSlug: slug, saldo: 7,
  };
}

const listarProdutos = vi.fn();
const obterFiltros = vi.fn();
const indicadores = vi.fn();

vi.mock("@/app/(dashboard)/estoque/actions", () => ({
  actionListarProdutos: (...args: unknown[]) => listarProdutos(...args),
  actionObterFiltrosEstoque: (...args: unknown[]) => obterFiltros(...args),
  actionIndicadoresEstoque: (...args: unknown[]) => indicadores(...args),
  actionListarProdutosParados: vi.fn(() => Promise.resolve([])),
  actionListarDivergenciasEstoque: vi.fn(() => Promise.resolve([])),
  actionResolverDivergenciaEstoque: vi.fn(() => Promise.resolve({})),
  actionImportarCatalogoEstoque: vi.fn(() => Promise.resolve({ produtosCriados: 0 })),
  actionDefinirEstoqueMinimoEmLote: vi.fn(() => Promise.resolve({ atualizados: 1 })),
  actionRegistrarMovimento: vi.fn(() => Promise.resolve({})),
  actionEditarProduto: vi.fn(() => Promise.resolve({})),
  actionListarContasCanal: vi.fn(() => Promise.resolve([])),
  actionListarMapeamentosCanal: vi.fn(() => Promise.resolve([])),
  actionSalvarMapeamentoCanal: vi.fn(() => Promise.resolve()),
  actionRemoverMapeamentoCanal: vi.fn(() => Promise.resolve()),
  actionListarMarcasEstoque: vi.fn(() => Promise.resolve([])),
}));

const { EstoqueLista } = await import("@/app/(dashboard)/estoque/estoque-lista");

beforeEach(() => {
  vi.clearAllMocks();
  // Sem isso o tour cobre a tela e atrapalha as consultas.
  window.localStorage.setItem(pagesConfig.estoque.coach.storageKey, "seen");

  obterFiltros.mockResolvedValue({ marcas: MARCAS, canais: CANAIS });
  indicadores.mockResolvedValue({
    total: 460, abaixoMinimo: 0, semEstoque: 0, semMinimo: 458, parados: 0,
    capitalParado: 0, divergencias: 0,
  });
  listarProdutos.mockImplementation((opts: { brandIds?: string[]; busca?: string } = {}) => {
    const marcasContexto = (opts as { canalTipos?: string[] }).canalTipos?.includes("mercadolivre")
      ? MARCAS.map((m) => m.slug === "wuwu" ? { ...m, total: 0 } : m)
      : MARCAS;
    if (opts.busca) {
      const marca = MARCAS.find((m) => `SKU-${m.slug}`.toLowerCase().includes(opts.busca!.toLowerCase()));
      if (!marca) return Promise.resolve({ data: [], total: 0, permissions: { canManage: true }, marcas: MARCAS, canais: CANAIS, indicadores: null });
      return Promise.resolve({
        data: [produtoDe(marca.brandId, `SKU-${marca.slug}`, `Produto ${marca.name}`, marca.slug, marca.name)],
        total: 1,
        permissions: { canManage: true },
        marcas: marcasContexto, canais: CANAIS, indicadores: null,
      });
    }
    // Com mais de uma empresa marcada, a lista soma o catálogo de cada uma —
    // é o comportamento que distingue multi-seleção de um simples radio. Sem
    // empresa marcada, a consulta é a do canal inteiro e entram todas.
    const noEscopo = opts.brandIds?.length
      ? MARCAS.filter((m) => opts.brandIds!.includes(m.brandId))
      : MARCAS;
    const selecionadas = noEscopo.filter((m) => m.total > 0);
    if (selecionadas.length === 0) {
      return Promise.resolve({ data: [], total: 0, permissions: { canManage: true }, marcas: MARCAS, canais: CANAIS, indicadores: null });
    }
    return Promise.resolve({
      data: selecionadas.map((m) => produtoDe(m.brandId, `SKU-${m.slug}`, `Produto ${m.name}`, m.slug, m.name)),
      total: selecionadas.reduce((soma, m) => soma + m.total, 0),
      permissions: { canManage: true },
      marcas: marcasContexto, canais: CANAIS, indicadores: null,
    });
  });
});

afterEach(cleanup);

describe("Estoque — escopo por empresa", () => {
  it("abre limpa: convite no lugar da lista, nenhum produto na tela", async () => {
    render(<EstoqueLista />);

    expect(await screen.findByTestId("estoque-escolha-empresa")).toBeInTheDocument();
    expect(screen.queryByTestId("estoque-table")).not.toBeInTheDocument();
    expect(screen.queryByTestId("estoque-cards")).not.toBeInTheDocument();
  });

  it("não aquece produtos em segundo plano sem escopo escolhido", async () => {
    render(<EstoqueLista />);

    await screen.findByRole("button", { name: "KARZI" });
    expect(listarProdutos).not.toHaveBeenCalled();
  });

  it("mostra as três empresas com a contagem cruzada pelo canal", async () => {
    render(<EstoqueLista />);

    // A pílula não mostra mais a contagem em texto (ver componente de
    // filtro) — o que resta observável é o efeito dela: quem tem produto
    // no canal fica clicável, quem não tem fica travado (abaixo).
    const karzi = await screen.findByRole("button", { name: "KARZI" });
    expect(karzi).not.toBeDisabled();
    expect(await screen.findByRole("button", { name: "WUWU" })).not.toBeDisabled();

    // Empresa sem produto no canal ativo fica travada, com o motivo no title.
    const vazia = await screen.findByRole("button", { name: "ARMARINHOS LIMA" });
    expect(vazia).toBeDisabled();
    expect(vazia).toHaveAttribute(
      "title",
      pagesConfig.estoque.brandSelector.emptyHint.replace("{marca}", "ARMARINHOS LIMA"),
    );
  });

  it("empresa sem canal não abre a lista — o convite continua no lugar dela", async () => {
    render(<EstoqueLista />);

    const karzi = await screen.findByRole("button", { name: "KARZI" });
    fireEvent.click(karzi);

    // Marcada, sim; mas empresa sozinha significaria somar os três canais,
    // que é justamente o que a tela não mostra (ver `escopoIncompleto`).
    expect(karzi).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByTestId("estoque-escolha-empresa")).toBeInTheDocument();
    expect(screen.queryByTestId("estoque-table")).not.toBeInTheDocument();
    expect(listarProdutos).not.toHaveBeenCalled();

    // O canal completa o escopo e só então a lista aparece.
    fireEvent.click(await screen.findByRole("button", { name: /^Mercado Livre/ }));
    expect(await screen.findByTestId("estoque-table")).toBeInTheDocument();
  });

  it("canal sozinho não abre a lista — e não acende empresa nenhuma", async () => {
    render(<EstoqueLista />);

    const karzi = await screen.findByRole("button", { name: "KARZI" });
    const wuwu = await screen.findByRole("button", { name: "WUWU" });
    const ml = await screen.findByRole("button", { name: /^Mercado Livre/ });

    // O canal já foi porta de entrada sozinho, acendendo as empresas dele.
    // Agora ele é metade do escopo: acende só a si mesmo, e a tela espera.
    fireEvent.click(ml);
    expect(await screen.findByTestId("estoque-escolha-empresa")).toBeInTheDocument();
    expect(screen.queryByTestId("estoque-table")).not.toBeInTheDocument();
    expect(karzi).toHaveAttribute("aria-pressed", "false");
    expect(wuwu).toHaveAttribute("aria-pressed", "false");

    // Com a empresa escolhida à mão, aí sim a lista abre.
    fireEvent.click(karzi);
    expect(await screen.findByTestId("estoque-table")).toBeInTheDocument();
    // Cartão mobile e tabela coexistem no DOM (quem esconde um dos dois é o
    // CSS, que o jsdom não aplica), então o nome aparece duas vezes.
    expect((await screen.findAllByText("Produto KARZI")).length).toBeGreaterThan(0);

    // Tirar o canal volta à tela limpa — e a empresa continua marcada, porque
    // nada a desmarca por conta própria.
    fireEvent.click(ml);
    expect(await screen.findByTestId("estoque-escolha-empresa")).toBeInTheDocument();
    expect(screen.queryByTestId("estoque-table")).not.toBeInTheDocument();
    expect(karzi).toHaveAttribute("aria-pressed", "true");
  });

  it("recontagem das empresas acompanha o(s) canal(is) selecionado(s)", async () => {
    render(<EstoqueLista />);
    const karzi = await screen.findByRole("button", { name: "KARZI" });

    const ml = await screen.findByRole("button", { name: /^Mercado Livre/ });
    fireEvent.click(ml);
    // Cada empresa entra por clique próprio — o canal não traz nenhuma junto.
    // ARMARINHOS LIMA fica de fora porque tem zero produtos no fixture, e
    // pílula sem dado nasce travada (regra antiga, que segue valendo).
    const wuwu = await screen.findByRole("button", { name: "WUWU" });
    fireEvent.click(karzi);
    fireEvent.click(wuwu);

    // Espera a SELEÇÃO assentar antes de olhar as chamadas. Cada clique
    // dispara uma recarga própria, então afirmar sobre "alguma chamada com as
    // duas" corria contra a que tinha só a primeira — passava ou falhava
    // conforme a ordem em que as recargas terminassem.
    await waitFor(() => {
      expect(karzi).toHaveAttribute("aria-pressed", "true");
      expect(wuwu).toHaveAttribute("aria-pressed", "true");
    });
    await waitFor(() => {
      expect(listarProdutos).toHaveBeenLastCalledWith(
        expect.objectContaining({
          brandIds: expect.arrayContaining([MARCAS[0].brandId, MARCAS[1].brandId]),
          canalTipos: ["mercadolivre"],
        }),
      );
    });

    // Desmarcar a WUWU deixa o recorte na KARZI sozinha.
    fireEvent.click(wuwu);
    expect(karzi).toHaveAttribute("aria-pressed", "true");

    await waitFor(() => {
      expect(listarProdutos).toHaveBeenCalledWith(
        expect.objectContaining({
          brandIds: [MARCAS[0].brandId],
          canalTipos: ["mercadolivre"],
        }),
      );
    });
  });

  it("com o canal ligado, a empresa continua livre pra desligar e ligar de novo", async () => {
    render(<EstoqueLista />);

    const ml = await screen.findByRole("button", { name: /^Mercado Livre/ });
    const karzi = await screen.findByRole("button", { name: "KARZI" });
    const wuwu = await screen.findByRole("button", { name: "WUWU" });
    fireEvent.click(ml);
    fireEvent.click(karzi);
    fireEvent.click(wuwu);
    expect(await screen.findByTestId("estoque-table")).toBeInTheDocument();

    // A trava antiga: o Mercado Livre grudava a empresa e não deixava tirar.
    fireEvent.click(karzi);
    await waitFor(() => expect(karzi).toHaveAttribute("aria-pressed", "false"));
    // Sai do recorte, mas a WUWU segura a lista na tela — desmarcar uma não
    // arrasta a outra.
    expect(screen.getByTestId("estoque-table")).toBeInTheDocument();
    expect(wuwu).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(karzi);
    await waitFor(() => expect(karzi).toHaveAttribute("aria-pressed", "true"));
  });

  it("bloqueia a KARZI quando somente a Shopee esta selecionada", async () => {
    obterFiltros.mockResolvedValue({ marcas: MARCAS, canais: CANAIS_COM_SHOPEE });
    render(<EstoqueLista marcasIniciais={MARCAS} canaisIniciais={CANAIS_COM_SHOPEE} />);

    const ml = screen.getByRole("button", { name: /^Mercado Livre/ });
    const shopee = screen.getByRole("button", { name: /^Shopee/ });
    const karzi = screen.getByRole("button", { name: "KARZI" });

    fireEvent.click(shopee);
    expect(karzi).toHaveAttribute("aria-disabled", "true");
    expect(karzi).toHaveAttribute("aria-pressed", "false");

    // Com o Mercado Livre junto ela volta a operar — mas quem acende é o
    // clique nela, não o canal.
    fireEvent.click(ml);
    expect(karzi).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(karzi);
    expect(karzi).toHaveAttribute("aria-pressed", "true");

    // Tirando o Mercado Livre sobra só a Shopee: a KARZI é podada, senão
    // ficaria marcada atrás de uma pílula travada, sem como desmarcar.
    fireEvent.click(ml);
    expect(karzi).toHaveAttribute("aria-disabled", "true");
    expect(karzi).toHaveAttribute("aria-pressed", "false");
  });

  it("permite marcar mais de uma empresa ao mesmo tempo, sem desmarcar a anterior", async () => {
    render(<EstoqueLista />);

    const karzi = await screen.findByRole("button", { name: "KARZI" });
    const wuwu = await screen.findByRole("button", { name: "WUWU" });

    // Aqui o assunto é multi-seleção de empresa, não a recontagem por canal
    // (essa tem teste próprio acima): as contagens ficam paradas para as duas
    // empresas seguirem clicáveis com o Mercado Livre ligado.
    listarProdutos.mockImplementation((opts: { brandIds?: string[] } = {}) => {
      const selecionadas = MARCAS.filter((m) => opts.brandIds?.includes(m.brandId) && m.total > 0);
      return Promise.resolve({
        data: selecionadas.map((m) => produtoDe(m.brandId, `SKU-${m.slug}`, `Produto ${m.name}`, m.slug, m.name)),
        total: selecionadas.reduce((soma, m) => soma + m.total, 0),
        permissions: { canManage: true },
        marcas: MARCAS, canais: CANAIS, indicadores: null,
      });
    });

    // Canal primeiro: sem ele, empresa marcada não abre lista nenhuma. E ele
    // não traz empresa junto — as duas entram por clique.
    fireEvent.click(await screen.findByRole("button", { name: /^Mercado Livre/ }));
    fireEvent.click(karzi);
    fireEvent.click(wuwu);
    expect(await screen.findByTestId("estoque-table")).toBeInTheDocument();

    // Desmarcar e remarcar a KARZI não mexe na WUWU — não é um radio, é um
    // conjunto.
    fireEvent.click(karzi);
    await waitFor(() => expect(karzi).toHaveAttribute("aria-pressed", "false"));
    fireEvent.click(karzi);

    await waitFor(() => expect(karzi).toHaveAttribute("aria-pressed", "true"));
    expect(wuwu).toHaveAttribute("aria-pressed", "true");

    await waitFor(() => {
      expect(listarProdutos).toHaveBeenCalledWith(expect.objectContaining({
        brandIds: expect.arrayContaining([
          "10000000-0000-4000-8000-000000000001",
          "10000000-0000-4000-8000-000000000002",
        ]),
      }));
    });
    expect((await screen.findAllByText("Produto KARZI")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("Produto WUWU")).length).toBeGreaterThan(0);

    // Desmarcar uma mantém a outra — a lista não volta para a tela limpa.
    fireEvent.click(karzi);
    await waitFor(() => expect(karzi).toHaveAttribute("aria-pressed", "false"));
    expect(screen.getByTestId("estoque-table")).toBeInTheDocument();
    expect(wuwu).toHaveAttribute("aria-pressed", "true");
  });

  it("empresa selecionada que zera com o canal continua clicável para desmarcar", async () => {
    // Cenário específico: WUWU tem 148 produtos no catálogo geral, mas nenhum
    // anunciado no Mercado Livre. Selecionar o canal depois de já ter marcado
    // a empresa não pode travar o botão — senão a pessoa fica presa com um
    // filtro que não consegue mais tirar.
    obterFiltros.mockImplementation((opts?: { canalTipos?: string[] }) => {
      if (opts?.canalTipos?.includes("mercadolivre")) {
        return Promise.resolve({
          marcas: MARCAS.map((m) => m.slug === "wuwu" ? { ...m, total: 0 } : m),
          canais: CANAIS,
        });
      }
      return Promise.resolve({ marcas: MARCAS, canais: CANAIS });
    });

    render(<EstoqueLista />);
    const wuwu = await screen.findByRole("button", { name: "WUWU" });
    fireEvent.click(wuwu);
    expect(wuwu).not.toBeDisabled();

    const ml = await screen.findByRole("button", { name: /^Mercado Livre/ });
    fireEvent.click(ml);

    // A pílula não mostra mais a contagem (ver componente de filtro) —
    // espera o refetch de produtos (é ele quem recalcula `marcas` com o
    // canal aplicado, ver `carregar` em estoque-lista.tsx) terminar pela
    // própria chamada mockada, não por texto na tela.
    await waitFor(() => expect(listarProdutos).toHaveBeenCalledWith(
      expect.objectContaining({ canalTipos: ["mercadolivre"] }),
    ));
    // Zerou, mas segue selecionada: continua clicável para poder desmarcar.
    expect(wuwu).not.toBeDisabled();
    expect(wuwu).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(wuwu);
    await waitFor(() => expect(wuwu).toHaveAttribute("aria-pressed", "false"));
  });

  it("permite marcar mais de um canal ao mesmo tempo", async () => {
    render(<EstoqueLista />);

    const ml = await screen.findByRole("button", { name: /^Mercado Livre/ });
    fireEvent.click(ml);
    fireEvent.click(await screen.findByRole("button", { name: "KARZI" }));
    await waitFor(() => {
      expect(listarProdutos).toHaveBeenCalledWith(
        expect.objectContaining({ canalTipos: ["mercadolivre"] }),
      );
    });
    expect(ml).toHaveAttribute("aria-pressed", "true");

    // Shopee está desconectado neste fixture — permanece bloqueado mesmo com
    // multi-seleção habilitada; a trava é sobre a conta, não sobre o modo.
    // Continua tocável de propósito (não é um <button disabled>): no toque,
    // mostra o motivo via toast em vez de simplesmente não reagir — por
    // isso a checagem é aria-disabled, não o atributo disabled nativo.
    const shopee = screen.getByRole("button", { name: /Shopee/ });
    expect(shopee).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(shopee);
    expect(obterFiltros).not.toHaveBeenCalledWith({ canalTipos: ["shopee"] });
  });

  it("busca sozinha não abre mais a lista — ela estreita o escopo, não o substitui", async () => {
    render(<EstoqueLista />);
    await screen.findByTestId("estoque-escolha-empresa");

    // A busca já foi uma terceira porta ("um SKU já é escopo exato"). Deixou
    // de ser: o mesmo SKU existe em canais que medem saldo com réguas
    // diferentes, e sem recorte a linha não sabe qual saldo mostrar.
    const busca = screen.getByPlaceholderText(pagesConfig.estoque.searchPlaceholder);
    fireEvent.change(busca, { target: { value: "SKU-karzi" } });

    expect(await screen.findByTestId("estoque-escolha-empresa")).toBeInTheDocument();
    expect(screen.queryByTestId("estoque-table")).not.toBeInTheDocument();

    // Com empresa e canal escolhidos, a busca volta a valer.
    fireEvent.click(await screen.findByRole("button", { name: /^Mercado Livre/ }));
    fireEvent.click(await screen.findByRole("button", { name: "KARZI" }));
    expect(await screen.findByTestId("estoque-table")).toBeInTheDocument();
  });
});
