import { describe, expect, it } from "vitest";
import { fontesAlteradas, maiorVersao } from "@/modules/canais/domain/versao-fontes";

describe("versão por fonte", () => {
  const base = {
    pedidos: "2026-08-26T10:00:00.000Z",
    estoque: "2026-08-26T09:00:00.000Z",
    avaliacoes: null,
  };

  it("não trata a primeira leitura como mudança", () => {
    // Sem leitura anterior a tela acabou de carregar os próprios dados;
    // anunciar mudança aqui faria tudo recarregar em seguida à toa.
    expect(fontesAlteradas(null, base)).toEqual([]);
    expect(fontesAlteradas(undefined, base)).toEqual([]);
  });

  it("aponta só a fonte que mudou", () => {
    const depois = { ...base, pedidos: "2026-08-26T10:05:00.000Z" };
    expect(fontesAlteradas(base, depois)).toEqual(["pedidos"]);
  });

  it("não acusa mudança quando nada mudou", () => {
    expect(fontesAlteradas(base, { ...base })).toEqual([]);
  });

  /* O caso que motivou a separação: em Métricas, um pedido novo derrubava o
     cache dos cinco cartões, de Saúde, de Pós-venda e do snapshot — inclusive
     dos blocos que só dependem de estoque ou de avaliação. */
  it("um pedido novo não mexe com estoque nem avaliações", () => {
    const depois = { ...base, pedidos: "2026-08-26T11:00:00.000Z" };
    const alteradas = fontesAlteradas(base, depois);
    expect(alteradas).not.toContain("estoque");
    expect(alteradas).not.toContain("avaliacoes");
  });

  it("reconhece fonte que saiu de vazia para preenchida", () => {
    const depois = { ...base, avaliacoes: "2026-08-26T10:10:00.000Z" };
    expect(fontesAlteradas(base, depois)).toEqual(["avaliacoes"]);
  });

  it("trata ausente e nulo como o mesmo estado", () => {
    expect(fontesAlteradas({ pedidos: null }, { pedidos: null })).toEqual([]);
    expect(fontesAlteradas({}, { pedidos: null })).toEqual([]);
  });

  it("acusa várias fontes de uma vez", () => {
    const depois = {
      pedidos: "2026-08-26T12:00:00.000Z",
      estoque: "2026-08-26T12:00:00.000Z",
      avaliacoes: null,
    };
    expect(fontesAlteradas(base, depois).sort()).toEqual(["estoque", "pedidos"]);
  });
});

describe("maior versão", () => {
  it("devolve o carimbo mais recente", () => {
    expect(maiorVersao([
      "2026-08-26T09:00:00.000Z",
      "2026-08-26T11:30:00.000Z",
      "2026-08-26T10:00:00.000Z",
    ])).toBe("2026-08-26T11:30:00.000Z");
  });

  it("ignora nulos e indefinidos", () => {
    expect(maiorVersao([null, "2026-08-26T09:00:00.000Z", undefined])).toBe("2026-08-26T09:00:00.000Z");
    expect(maiorVersao([null, undefined])).toBeNull();
    expect(maiorVersao([])).toBeNull();
  });
});
