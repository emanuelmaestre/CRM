import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { agruparPorSecao, Bloco, ordenarPorUrgencia, type BlocoDef } from "@/app/(dashboard)/metricas/bloco";
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
  it("não mostra o número nem pílula nenhuma quando falta escolher marca", () => {
    // Escolher marca é coisa de dentro do card aberto — o mosaico só avisa o
    // que vai aparecer, sem virar formulário.
    renderBloco(bloco({
      semFiltro: true,
      resumo: { valor: "4", legenda: "itens perto do mínimo" },
    }));

    expect(screen.queryByText("4")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /karzi|wuwu|lima/i })).not.toBeInTheDocument();
    expect(screen.getByText("Abra para escolher a marca.")).toBeInTheDocument();
  });

  it("o único controle do bloco é o que abre o card", () => {
    // Guarda a limpeza visual: um tile não é botão dentro de botão nem uma
    // fileira de pílulas — é um card com um único alvo de clique.
    renderBloco(bloco());
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("não repete a mesma frase como número e como rodapé quando não há valor", () => {
    // Achado real: "Vendem mais" sem produto no período usava a mesma legenda
    // como descrição central e como rodapé — a frase aparecia duas vezes.
    renderBloco(bloco({
      resumo: { valor: null, legenda: "no topo do período", rodape: "no topo do período" },
    }));
    expect(screen.getAllByText("no topo do período")).toHaveLength(1);
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

describe("agrupamento por seção", () => {
  it("mantém a ordem fixa das seções e ordena por urgência só dentro de cada uma", () => {
    const { grupos, lista } = agruparPorSecao([
      bloco({ id: "acoes", secao: "marketing", resumo: { valor: null } }),
      bloco({ id: "faturamento", secao: "financeiro", resumo: { valor: "R$ 1" } }),
      // Alerta crítico aqui não pode saltar por cima do bloco Financeiro —
      // é exatamente o comportamento que a separação em seções corrigiu.
      bloco({ id: "reposicao", secao: "estoque", resumo: { valor: "4", alerta: { nivel: "critico", texto: "repor" } } }),
      bloco({ id: "score", secao: "saude", resumo: { valor: "78" } }),
    ]);

    expect(grupos.map((grupo) => grupo.id)).toEqual(["financeiro", "saude", "estoque", "marketing"]);
    expect(lista.map((item) => item.id)).toEqual(["faturamento", "score", "reposicao", "acoes"]);
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
