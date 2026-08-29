import { beforeEach, describe, expect, it, vi } from "vitest";

/* `vincularAvaliacoesAPedidos` faz duas consultas em sequência: os pedidos por
   `provider_order_id`, e depois os itens desses pedidos. O mock devolve uma
   resposta por chamada, na ordem. */
const respostas: unknown[][] = [];
const where = vi.fn(() => Promise.resolve(respostas.shift() ?? []));
const innerJoin = vi.fn(() => ({ where, innerJoin: () => ({ where }) }));
const from = vi.fn(() => ({ innerJoin, where }));
const select = vi.fn(() => ({ from }));
vi.mock("@/shared/lib/db", () => ({ db: { select: () => select() } }));
vi.mock("server-only", () => ({}));

const { vincularAvaliacoesAPedidos } = await import(
  "@/modules/canais/application/identificacao-avaliacao.service"
);

const ORG = "11111111-1111-4111-8111-111111111111";

/* Por que este vínculo é exato e não um palpite: a Shopee manda o `order_sn`
   dentro do próprio comentário. Medido contra os dados reais em 28/08/2026,
   antes de escrever o código: de 319 `order_sn` distintos, 316 acharam pedido
   no CRM (99,1%), todos com cliente. Os 3 sem par são anteriores ao pedido
   Shopee mais antigo importado (28/05/2026) — não são erro da junção. */
describe("vínculo entre avaliação da Shopee e pedido do CRM", () => {
  beforeEach(() => {
    respostas.length = 0;
    select.mockClear();
  });

  it("liga a avaliação ao cliente, ao valor e aos itens comprados", async () => {
    respostas.push(
      [{
        pedidoId: "p1", providerOrderId: "260826C1F9S5EE", clienteId: "c1",
        clienteNome: "Maria Souza", total: "89.90", criadoEm: new Date("2026-08-20T10:00:00Z"),
      }],
      [
        { pedidoId: "p1", nome: "Linha de costura preta", quantidade: 2 },
        { pedidoId: "p1", nome: "Agulha n.7", quantidade: 1 },
      ],
    );

    const mapa = await vincularAvaliacoesAPedidos(ORG, [
      { id: "op1", pedidoCanal: "260826C1F9S5EE" },
    ]);

    expect(mapa.get("op1")).toMatchObject({
      clienteId: "c1",
      clienteNome: "Maria Souza",
      pedidoId: "p1",
      total: "89.90",
    });
    expect(mapa.get("op1")?.itens).toEqual([
      { nome: "Linha de costura preta", quantidade: 2 },
      { nome: "Agulha n.7", quantidade: 1 },
    ]);
  });

  /* Pedido anterior ao histórico importado: a avaliação existe, o pedido não.
     A tela precisa cair no número solto do canal, nunca inventar um cliente. */
  it("omite a avaliação cujo pedido não está no CRM, sem inventar vínculo", async () => {
    respostas.push([], []);

    const mapa = await vincularAvaliacoesAPedidos(ORG, [
      { id: "op1", pedidoCanal: "2605211UXRH27N" },
    ]);

    expect(mapa.size).toBe(0);
  });

  it("não consulta o banco quando nenhuma avaliação traz pedido", async () => {
    const mapa = await vincularAvaliacoesAPedidos(ORG, []);
    expect(mapa.size).toBe(0);
    expect(select).not.toHaveBeenCalled();
  });

  /* Duas avaliações do mesmo pedido (o comprador avaliou dois itens da mesma
     compra) não podem virar duas consultas nem perder uma das duas. */
  it("resolve várias avaliações do mesmo pedido com uma consulta só", async () => {
    respostas.push(
      [{
        pedidoId: "p1", providerOrderId: "260826C1F9S5EE", clienteId: "c1",
        clienteNome: "Maria Souza", total: "89.90", criadoEm: new Date("2026-08-20T10:00:00Z"),
      }],
      [{ pedidoId: "p1", nome: "Linha", quantidade: 1 }],
    );

    const mapa = await vincularAvaliacoesAPedidos(ORG, [
      { id: "op1", pedidoCanal: "260826C1F9S5EE" },
      { id: "op2", pedidoCanal: "260826C1F9S5EE" },
    ]);

    expect(mapa.size).toBe(2);
    expect(mapa.get("op1")?.clienteNome).toBe("Maria Souza");
    expect(mapa.get("op2")?.clienteNome).toBe("Maria Souza");
    // Uma consulta de pedidos + uma de itens. Nunca uma por avaliação.
    expect(select).toHaveBeenCalledTimes(2);
  });
});
