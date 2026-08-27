import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { SeletorCanalAnuncios } from "@/app/(dashboard)/anuncios/anuncios-cliente";
import { CanalAnunciosProvider } from "@/app/(dashboard)/anuncios/canal-anuncios";

/* O seletor de canal de Anúncios foi decorativo até 26/08/2026: mostrava os
   três canais mas só o Mercado Livre tinha dado, e clicar em Shopee só dava um
   aviso. Com o app de Product Ads da Shopee no ar ele passou a filtrar de
   verdade — e a escolha precisa sobreviver à navegação entre as cinco telas do
   módulo, por isso mora no localStorage e não no estado de uma tela só.

   Limpar o localStorage entre os testes basta para zerar o estado: o store lê
   o armazenamento a cada leitura de snapshot, sem guardar cópia própria. */

function montar() {
  return render(
    <CanalAnunciosProvider>
      <SeletorCanalAnuncios />
    </CanalAnunciosProvider>,
  );
}

const aba = (nome: RegExp) => screen.getByRole("tab", { name: nome });
const MERCADO_LIVRE = /mercado livre/i;
const SHOPEE = /shopee/i;
const TIKTOK = /tiktok/i;

describe("seletor de canal do módulo Anúncios", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("começa no Mercado Livre, que era o único canal antes da Shopee", () => {
    montar();

    expect(aba(MERCADO_LIVRE)).toHaveAttribute("aria-selected", "true");
    expect(aba(SHOPEE)).toHaveAttribute("aria-selected", "false");
  });

  /* Escolha única e não múltipla de propósito: somar Mercado Livre e Shopee num
     ROAS só não significaria nada — a Shopee atribui venda em 7 dias após o
     clique, o Mercado Livre não usa essa janela. */
  it("troca para a Shopee ao clicar, e só um canal fica ativo por vez", () => {
    montar();
    fireEvent.click(aba(SHOPEE));

    expect(aba(SHOPEE)).toHaveAttribute("aria-selected", "true");
    expect(aba(MERCADO_LIVRE)).toHaveAttribute("aria-selected", "false");
  });

  it("guarda a escolha pra sobreviver à navegação entre as telas", () => {
    montar();
    fireEvent.click(aba(SHOPEE));

    expect(window.localStorage.getItem("anuncios:canal")).toBe("shopee");
  });

  it("restaura o canal guardado ao montar de novo, como acontece ao trocar de tela", () => {
    window.localStorage.setItem("anuncios:canal", "shopee");
    montar();

    expect(aba(SHOPEE)).toHaveAttribute("aria-selected", "true");
    expect(aba(MERCADO_LIVRE)).toHaveAttribute("aria-selected", "false");
  });

  it("TikTok Shop continua travado — não existe Product Ads dele integrado", () => {
    montar();
    const tiktok = aba(TIKTOK);

    expect(tiktok).toBeDisabled();
    fireEvent.click(tiktok);

    expect(tiktok).toHaveAttribute("aria-selected", "false");
    expect(aba(MERCADO_LIVRE)).toHaveAttribute("aria-selected", "true");
  });

  it("ignora valor inválido guardado no navegador em vez de quebrar a tela", () => {
    window.localStorage.setItem("anuncios:canal", "olist");
    montar();

    expect(aba(MERCADO_LIVRE)).toHaveAttribute("aria-selected", "true");
  });
});
