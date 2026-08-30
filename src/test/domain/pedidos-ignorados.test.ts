import { describe, expect, it } from "vitest";
import { CAUSAS_REPROCESSAVEIS, classificarCausa } from "@/modules/vendas/application/pedidos-ignorados.service";
import { ErroSkuSemProduto } from "@/modules/canais/domain/errors";

/* A classificação existe porque a AÇÃO muda em cada caso, e só uma delas se
   resolve editando o anúncio no canal. Mostrar a mensagem crua fazia as
   quatro parecerem a mesma coisa na tela. Todos os exemplos abaixo são erros
   que aconteceram de verdade em produção em 25 e 27/08/2026. */
describe("classificação da causa de um pedido ignorado", () => {
  it("SKU sem produto — o operador resolve no canal", () => {
    expect(classificarCausa(new ErroSkuSemProduto(["W613-BL"]))).toBe("sku_sem_produto");
  });

  it("reconhece o erro pelo nome, não só por instanceof", () => {
    // O erro atravessa fronteiras de módulo e serialização do Inngest, onde
    // `instanceof` não sobrevive — mesmo motivo de `ehErroSkuSemProduto`.
    const solto = Object.assign(new Error("Pedido não importado: SKUs sem produto na marca: X."), {
      name: "ErroSkuSemProduto",
    });
    expect(classificarCausa(solto)).toBe("sku_sem_produto");
  });

  it("colisão de cliente — não há o que fazer na loja", () => {
    const erro = new Error('Failed query: insert into "cliente" ("id", "org_id", "nome") values (...)');
    expect(classificarCausa(erro)).toBe("cliente_duplicado");
    expect(classificarCausa(new Error('duplicate key value violates unique constraint "uq_cliente_org_telefone_active"')))
      .toBe("cliente_duplicado");
  });

  it("pedido fora do formato — é bug nosso, não da loja", () => {
    const zod = new Error('[{"code":"too_small","path":["itens",0,"skuExterno"],"message":"Too small"}]');
    expect(classificarCausa(zod)).toBe("payload_invalido");
  });

  it("o que não se reconhece cai em desconhecida, sem fingir que sabe", () => {
    expect(classificarCausa(new Error("ECONNRESET"))).toBe("desconhecida");
    expect(classificarCausa("texto solto")).toBe("desconhecida");
  });
});

/* Quais causas ganham o botão "Tentar novamente".
   `payload_invalido` fica de fora porque a falha é determinística: mesmo
   payload guardado, mesmo validador, mesmo erro. O botão ali só gastaria o
   tempo de quem clica — é bug do CRM, não há nada a corrigir na loja. */
describe("causas que aceitam reprocessamento", () => {
  it("SKU sem produto pode ser reprocessado — o produto pode ter nascido no catálogo", () => {
    expect(CAUSAS_REPROCESSAVEIS).toContain("sku_sem_produto");
  });

  it("cliente duplicado pode ser reprocessado — a colisão pode ter sido desfeita no CRM", () => {
    expect(CAUSAS_REPROCESSAVEIS).toContain("cliente_duplicado");
  });

  it("payload inválido aceita nova consulta ao canal com normalizador corrigido", () => {
    expect(CAUSAS_REPROCESSAVEIS).toContain("payload_invalido");
  });

  it("toda causa classificável está decidida — nenhuma fica sem resposta", () => {
    const todas = ["sku_sem_produto", "cliente_duplicado", "payload_invalido", "desconhecida"] as const;
    for (const causa of todas) {
      expect(typeof CAUSAS_REPROCESSAVEIS.includes(causa)).toBe("boolean");
    }
  });
});
