import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Bloco, ordenarPorUrgencia, type BlocoDef } from "@/app/(dashboard)/metricas/bloco";
import { Package } from "lucide-react";

/* O mosaico existe para responder "o que precisa de mim?" antes de "quais são
   os números?". Os três contratos protegidos aqui são exatamente os que somem
   sem ninguém notar: bloco sem filtro não pode inventar um valor, bloco com
   pendência tem que subir na ordem, e bloco em foco não pode ficar montado no
   grid — se ficar, ele e o painel disputam o mesmo layoutId e o crescimento
   vira um salto. */

function bloco(parcial: Partial<BlocoDef> = {}): BlocoDef {
  return {
    id: "reposicao",
    titulo: "Repor em breve",
    icone: Package,
    accent: "var(--warning)",
    resumo: { valor: "4", legenda: "itens perto do mínimo" },
    render: () => <p>card completo</p>,
    ...parcial,
  };
}

function renderBloco(def: BlocoDef, focado = false) {
  return render(<ul><Bloco def={def} focado={focado} onAbrir={vi.fn()} /></ul>);
}

describe("bloco do mosaico", () => {
  it("mostra o seletor no lugar do número quando nenhuma marca foi escolhida", () => {
    renderBloco(bloco({
      semFiltro: true,
      seletor: <button type="button">KARZI</button>,
      resumo: { valor: "4", legenda: "itens perto do mínimo" },
    }));

    // O valor existe no resumo, mas sem filtro ele não pertence a marca nenhuma:
    // mostrá-lo seria atribuir a uma marca um número que é de outra.
    expect(screen.queryByText("4")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "KARZI" })).toBeInTheDocument();
  });

  it("não aninha as pílulas dentro do controle que abre o bloco", () => {
    // Botão dentro de botão é HTML inválido e, pior, faz o clique na pílula
    // abrir o card — escolher a marca viraria abrir a tela cheia.
    renderBloco(bloco({
      semFiltro: true,
      seletor: <button type="button">KARZI</button>,
    }));

    const pilula = screen.getByRole("button", { name: "KARZI" });
    expect(pilula.closest("button")).toBe(pilula);
  });

  it("não desenha número enquanto carrega", () => {
    renderBloco(bloco({ carregando: true }));
    expect(screen.queryByText("4")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Carregando")).toBeInTheDocument();
  });

  it("descreve o card quando não há um número que o resuma", () => {
    // Publicações e Pós-venda buscam os próprios dados só ao abrir.
    renderBloco(bloco({ id: "posVenda", resumo: { valor: null, legenda: "Cancelamento, atraso e devolução" } }));
    expect(screen.getByText("Cancelamento, atraso e devolução")).toBeInTheDocument();
  });

  it("desmonta o bloco em foco para o painel assumir o layoutId", () => {
    renderBloco(bloco(), true);
    expect(screen.queryByRole("button", { name: "Abrir Repor em breve" })).not.toBeInTheDocument();
  });

  it("mantém o card completo fora da árvore até o bloco abrir", () => {
    const render14 = vi.fn(() => <p>card completo</p>);
    renderBloco(bloco({ render: render14 }));
    // 14 cards montados de uma vez seria a parede de rolagem que o mosaico veio
    // resolver, agora invisível e ainda assim custando busca e render.
    expect(render14).not.toHaveBeenCalled();
  });
});

describe("ordem do mosaico", () => {
  it("põe na frente o que precisa de decisão, crítico antes de atenção", () => {
    const ordenado = ordenarPorUrgencia([
      bloco({ id: "faturamento", resumo: { valor: "R$ 1", alerta: null } }),
      bloco({ id: "parados", resumo: { valor: "3", alerta: { nivel: "atencao", texto: "parados" } } }),
      bloco({ id: "reclamacoes", resumo: { valor: "2", alerta: { nivel: "critico", texto: "abertas" } } }),
    ]);

    expect(ordenado.map((item) => item.id)).toEqual(["reclamacoes", "parados", "faturamento"]);
  });

  it("preserva a ordem escrita quando nada pede ação", () => {
    // Sem nada pegando fogo, a leitura em atos herdada do Painel e de Métricas
    // continua valendo — urgência reordena, não embaralha.
    const ordenado = ordenarPorUrgencia([
      bloco({ id: "faturamento", resumo: { valor: "R$ 1" } }),
      bloco({ id: "score", resumo: { valor: "78" } }),
      bloco({ id: "atendimento", resumo: { valor: "90%" } }),
    ]);

    expect(ordenado.map((item) => item.id)).toEqual(["faturamento", "score", "atendimento"]);
  });
});
