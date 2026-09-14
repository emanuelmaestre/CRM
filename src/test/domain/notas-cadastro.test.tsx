import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { notasVendas } from "@/app/(dashboard)/vendas/pedidos/notas-vendas";
import { notasPublicidade } from "@/app/(dashboard)/anuncios/notas-publicidade";
import { EXPLICACOES_CARDS, explicacoesResumoVendas } from "@/app/(dashboard)/vendas/pedidos/regras-resumo-vendas";
import { BotaoNotas } from "@/shared/components/notas/botao-notas";
import { CANAIS_NOTA, naoSeAplica } from "@/shared/components/notas/tipos";

const MODULOS = { vendas: notasVendas(), publicidade: notasPublicidade() };

describe("cadastro de notas", () => {
  it.each(Object.entries(MODULOS))("%s: todo assunto responde pelos três canais", (_, assuntos) => {
    const ids = assuntos.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const assunto of assuntos) {
      for (const canal of CANAIS_NOTA) {
        const nota = assunto.canais[canal];
        if (naoSeAplica(nota)) {
          expect(nota.naoSeAplica.length).toBeGreaterThan(20);
        } else {
          expect(nota.ondeVer).not.toBe("");
          expect(nota.significado).not.toBe("");
          expect(nota.painelOficial).not.toBe("");
        }
      }
    }
  });

  it("o wizard de Vendas usa o mesmo texto do ⓘ do card", () => {
    const faturamento = notasVendas().find((a) => a.id === "faturamento")!;
    const tiktok = faturamento.canais.tiktokshop;
    if (naoSeAplica(tiktok)) throw new Error("TikTok deveria ter nota de faturamento");
    expect(tiktok.significado).toContain(explicacoesResumoVendas(["tiktokshop"], EXPLICACOES_CARDS).faturamento.descricao);
  });

  it("o botão Notas abre o wizard e navega entre assuntos", async () => {
    render(<BotaoNotas titulo="Notas de Vendas" assuntos={notasVendas()} />);
    fireEvent.click(screen.getByRole("button", { name: "Notas" }));
    expect(screen.getByText("Assunto 1 de 10")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Próximo assunto" }));
    expect(await screen.findByText("Assunto 2 de 10")).toBeInTheDocument();
  });
});
