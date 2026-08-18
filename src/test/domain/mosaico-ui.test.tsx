import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { agruparPorSecao, Bloco, type BlocoDef } from "@/app/(dashboard)/metricas/bloco";
import { Package } from "lucide-react";

/* O mosaico virou um índice de navegação: o bloco fechado mostra só ícone e
   nome, nunca número, dica de filtro ou selo de alerta — quem quer o dado
   abre o card. Os contratos protegidos aqui são exatamente os que somem sem
   ninguém notar: o fechado não vaza nenhum valor por engano em nenhum
   estado, o único controle é o que abre o card, a ordem dentro de cada
   seção é sempre a mesma (sem reordenar por urgência), e o card em foco não
   fica montado no grid — se ficasse, ele e o painel disputariam o mesmo
   layoutId e o crescimento viraria um salto. */

function bloco(parcial: Partial<BlocoDef> = {}): BlocoDef {
  return {
    id: "reposicao",
    secao: "estoque",
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
  it("mostra só o nome do card, nunca o número, resumo ou dica de filtro", () => {
    renderBloco(bloco({
      semFiltro: true,
      resumo: { valor: "4", legenda: "itens perto do mínimo", rodape: "algum rodapé" },
    }));

    expect(screen.getByText("Repor em breve")).toBeInTheDocument();
    expect(screen.queryByText("4")).not.toBeInTheDocument();
    expect(screen.queryByText("itens perto do mínimo")).not.toBeInTheDocument();
    expect(screen.queryByText("algum rodapé")).not.toBeInTheDocument();
  });

  it("não mostra selo de alerta nem indicador de carregamento no fechado", () => {
    renderBloco(bloco({
      carregando: true,
      resumo: { valor: "2", alerta: { nivel: "critico", texto: "abertas" } },
    }));

    expect(screen.queryByText("abertas")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("o único controle do bloco é o que abre o card", () => {
    // Guarda a limpeza visual: um tile não é botão dentro de botão nem uma
    // fileira de pílulas — é um botão compacto com um único alvo de clique.
    renderBloco(bloco());
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Abrir Repor em breve" })).toBeInTheDocument();
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

describe("agrupamento por seção", () => {
  it("mantém a ordem fixa das seções e a ordem escrita dentro de cada uma", () => {
    const { grupos, lista } = agruparPorSecao([
      bloco({ id: "acoes", secao: "marketing", resumo: { valor: null } }),
      bloco({ id: "faturamento", secao: "financeiro", resumo: { valor: "R$ 1" } }),
      // Alerta crítico aqui não pode saltar pra frente de nenhum outro bloco
      // — a ordem dentro da seção é sempre a escrita, alerta ou não.
      bloco({ id: "reposicao", secao: "estoque", resumo: { valor: "4", alerta: { nivel: "critico", texto: "repor" } } }),
      bloco({ id: "score", secao: "saude", resumo: { valor: "78" } }),
    ]);

    expect(grupos.map((grupo) => grupo.id)).toEqual(["financeiro", "saude", "estoque", "marketing"]);
    expect(lista.map((item: BlocoDef) => item.id)).toEqual(["faturamento", "score", "reposicao", "acoes"]);
  });

  it("preserva a ordem escrita mesmo com vários blocos alertando na mesma seção", () => {
    const { lista } = agruparPorSecao([
      bloco({ id: "parados", secao: "estoque", resumo: { valor: "3", alerta: { nivel: "atencao", texto: "parados" } } }),
      bloco({ id: "reposicao", secao: "estoque", resumo: { valor: "4", alerta: { nivel: "critico", texto: "repor" } } }),
    ]);

    // "reposicao" tem o alerta mais grave, mas veio depois na lista — sem
    // reordenar por urgência, continua depois.
    expect(lista.map((item: BlocoDef) => item.id)).toEqual(["parados", "reposicao"]);
  });

  it("tira da tela uma seção sem bloco nenhum", () => {
    const { grupos } = agruparPorSecao([
      bloco({ id: "faturamento", secao: "financeiro" }),
    ]);

    expect(grupos).toHaveLength(1);
    expect(grupos[0].id).toBe("financeiro");
  });

  it("o rótulo da seção carrega o pior alerta dos blocos dentro dela", () => {
    const { grupos } = agruparPorSecao([
      bloco({ id: "reposicao", secao: "estoque", resumo: { valor: "4", alerta: { nivel: "atencao", texto: "repor" } } }),
      bloco({ id: "parados", secao: "estoque", resumo: { valor: "2", alerta: { nivel: "critico", texto: "parados" } } }),
    ]);

    expect(grupos[0].alerta).toBe("critico");
  });
});
