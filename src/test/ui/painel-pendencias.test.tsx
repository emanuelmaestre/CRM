import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PainelAtualizacao } from "@/modules/canais/application/painel-atualizacao.service";

/* O painel real busca sozinho via contexto; aqui o contexto é substituído
   para o teste poder entregar exatamente o estado que interessa. */
const painelMock = { valor: null as PainelAtualizacao | null };

vi.mock("@/shared/components/atualizacao/atualizacao-contexto", () => ({
  useAtualizacao: () => ({
    tela: "vendas" as const,
    painel: painelMock.valor,
    primeiraCarga: false,
    desatualizado: false,
    atualizandoLocal: false,
    contaDisparando: null,
    atualizarSomenteTela: () => {},
    verificarConta: async () => {},
  }),
}));

const { AtualizacaoToggle } = await import("@/shared/components/atualizacao/AtualizacaoToggle");

const CONTA = {
  id: "conta-shopee-al",
  canal: "shopee",
  canalLabel: "Shopee",
  usaProxy: true,
  brandId: "brand-al",
  brandSlug: "armarinhos_lima",
  brandLabel: "ARMARINHOS LIMA",
  modulosDisponiveis: ["pedidos"] as const,
  atualidade: [{
    modulo: "pedidos" as const,
    label: "Pedidos",
    ultimoSucesso: "2026-08-26T23:29:22.000Z",
    ultimaTentativa: "2026-08-26T23:29:22.000Z",
    esperarSegundos: 0,
  }],
  execucao: null,
};

function montarPainel(extra: Partial<PainelAtualizacao>): PainelAtualizacao {
  return {
    tela: "vendas",
    versoes: {},
    versao: "2026-08-26T23:29:22.000Z",
    progresso: 100,
    emAndamento: false,
    ultimaConcluida: "2026-08-26T23:29:22.000Z",
    falhas: [],
    pendencias: [],
    podeSincronizar: true,
    modulosDisponiveis: ["pedidos"],
    contas: [CONTA],
    ...extra,
  } as unknown as PainelAtualizacao;
}

function abrirPainel() {
  render(<AtualizacaoToggle modo="desktop" />);
  fireEvent.click(screen.getByRole("button", { name: /Dados atualizados|Atualizações/ }));
}

describe("painel de atualização — pedido pulado não vira falha de canal", () => {
  it("mostra a faixa de pendência dizendo que o canal RESPONDEU", () => {
    // O caso real de 26/08/2026: a Shopee entregou 1 pedido e ele não pôde
    // ser ingerido por SKU sem produto na marca.
    painelMock.valor = montarPainel({
      pendencias: [{
        contaId: "conta-shopee-al",
        canalLabel: "Shopee",
        brandLabel: "ARMARINHOS LIMA",
        itens: [{
          label: "Pedidos",
          ignorados: 1,
          motivos: ["Pedido não importado: SKUs sem produto na marca: KIT4_ESSENZA."],
        }],
      }],
    } as Partial<PainelAtualizacao>);

    abrirPainel();

    expect(screen.getByText(/Shopee respondeu · ARMARINHOS LIMA/)).toBeInTheDocument();
    expect(screen.getByText(/1 item de pedidos ficou de fora\. O resto entrou\./)).toBeInTheDocument();
    expect(screen.getByText(/KIT4_ESSENZA/)).toBeInTheDocument();
    // O ponto da correção: nada de "não respondeu" acusando o canal.
    expect(screen.queryByText(/não respondeu/)).not.toBeInTheDocument();
  });

  it("plural quando mais de um item fica de fora", () => {
    painelMock.valor = montarPainel({
      pendencias: [{
        contaId: "conta-shopee-al",
        canalLabel: "Shopee",
        brandLabel: "ARMARINHOS LIMA",
        itens: [{ label: "Pedidos", ignorados: 3, motivos: [] }],
      }],
    } as Partial<PainelAtualizacao>);

    abrirPainel();

    expect(screen.getByText(/3 itens de pedidos ficaram de fora/)).toBeInTheDocument();
  });

  it("canal fora do ar continua vermelho, com 'não respondeu'", () => {
    painelMock.valor = montarPainel({
      falhas: [{
        contaId: "conta-shopee-al",
        canal: "shopee",
        canalLabel: "Shopee",
        brandLabel: "ARMARINHOS LIMA",
        modulos: ["Pedidos"],
        erro: "Shopee HTTP 403 em get_order_list",
        ultimoDadoBom: "2026-08-26T18:17:00.000Z",
      }],
    } as Partial<PainelAtualizacao>);

    abrirPainel();

    expect(screen.getByText(/Shopee não respondeu · ARMARINHOS LIMA/)).toBeInTheDocument();
    expect(screen.queryByText(/ficou de fora/)).not.toBeInTheDocument();
  });

  it("sem pendência e sem falha, nenhuma das duas faixas aparece", () => {
    painelMock.valor = montarPainel({});

    abrirPainel();

    expect(screen.queryByText(/ficou de fora/)).not.toBeInTheDocument();
    expect(screen.queryByText(/não respondeu/)).not.toBeInTheDocument();
  });
});
