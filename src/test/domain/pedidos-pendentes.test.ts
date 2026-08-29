import { describe, expect, it } from "vitest";
import { filtrarPedidosPendentes } from "@/modules/canais/application/pedidos-pendentes.service";

type Linha = { providerOrderId: string; status: string; valorLiquido: string | null };

/** Banco de mentira com a mesma cadeia que o serviço usa. Um `then` no fim
 *  faz a cadeia se comportar como a promessa que o Drizzle devolve. */
function bancoCom(linhas: Linha[]) {
  const resultado = Promise.resolve(linhas);
  const cadeia = {
    select: () => cadeia,
    from: () => cadeia,
    where: () => resultado,
  };
  return cadeia as unknown as Parameters<typeof filtrarPedidosPendentes>[3];
}

function bancoQueFalha() {
  const cadeia = {
    select: () => cadeia,
    from: () => cadeia,
    where: () => Promise.reject(new Error("pool ocupado")),
  };
  return cadeia as unknown as Parameters<typeof filtrarPedidosPendentes>[3];
}

const ORG = "org-1";
const CONTA = "conta-1";

describe("filtrar pedidos que ainda precisam de leitura", () => {
  it("pede detalhe do pedido que ainda não existe no banco", async () => {
    const pendentes = await filtrarPedidosPendentes(
      ORG, CONTA,
      [{ providerOrderId: "A1", statusExterno: "READY_TO_SHIP" }],
      bancoCom([]),
    );
    expect(pendentes).toEqual(["A1"]);
  });

  /* O caso que paga a conta: a janela é sobreposta de propósito e revisita as
     mesmas horas várias vezes por dia. Pedido já gravado, já liquidado e no
     mesmo estágio não tem nada a ensinar — reler custaria detalhe e repasse
     para reescrever exatamente o que já está lá. */
  it("não relê pedido já gravado, liquidado e no mesmo estágio", async () => {
    const pendentes = await filtrarPedidosPendentes(
      ORG, CONTA,
      [{ providerOrderId: "A1", statusExterno: "COMPLETED" }],
      bancoCom([{ providerOrderId: "A1", status: "concluido", valorLiquido: "10.00" }]),
    );
    expect(pendentes).toEqual([]);
  });

  it("relê quando o canal avançou o estágio do pedido", async () => {
    const pendentes = await filtrarPedidosPendentes(
      ORG, CONTA,
      [{ providerOrderId: "A1", statusExterno: "SHIPPED" }],
      bancoCom([{ providerOrderId: "A1", status: "pago", valorLiquido: "10.00" }]),
    );
    expect(pendentes).toEqual(["A1"]);
  });

  it("relê enquanto o repasse não chegou, porque sem ele o faturamento sai errado", async () => {
    const pendentes = await filtrarPedidosPendentes(
      ORG, CONTA,
      [{ providerOrderId: "A1", statusExterno: "COMPLETED" }],
      bancoCom([{ providerOrderId: "A1", status: "concluido", valorLiquido: null }]),
    );
    expect(pendentes).toEqual(["A1"]);
  });

  /* Economizar chamada nunca pode custar um pedido não importado. */
  it("na dúvida relê a janela inteira", async () => {
    const pendentes = await filtrarPedidosPendentes(
      ORG, CONTA,
      [{ providerOrderId: "A1", statusExterno: "PAID" }, { providerOrderId: "A2", statusExterno: "PAID" }],
      bancoQueFalha(),
    );
    expect(pendentes).toEqual(["A1", "A2"]);
  });
});
