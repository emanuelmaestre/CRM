import { describe, expect, it } from "vitest";
import { explicacoesResumoVendas, legendaResumoVendas } from "@/app/(dashboard)/vendas/pedidos/regras-resumo-vendas";
import { IndicadorPedidosSchema } from "@/modules/vendas/domain/consulta-pedidos";

describe("explicações de vendas por canal", () => {
  it.each([["tiktokshop", "TikTok Shop"]])("explica a criação para %s sem atribuir a regra ao Mercado Livre", (canal, nome) => {
    expect(legendaResumoVendas([canal])).toContain(`${nome}: GMV e pedidos pagos pela data do pagamento`);
    const explicacoes = explicacoesResumoVendas([canal], {});
    expect(explicacoes.totalBruto.descricao).not.toContain("Mercado Livre");
    expect(explicacoes.totalBruto.inclui.join(" ")).toContain("pendentes");
    expect(explicacoes.cancelados.descricao).toContain("inclusive cancelados sem pagamento");
  });
  it("Shopee distingue criação, pagamento e cobertura parcial das devoluções", () => {
    expect(legendaResumoVendas(["shopee"])).toContain("Produto Pago pela data do pagamento");
    const e = explicacoesResumoVendas(["shopee"], {});
    expect(e.totalBruto.descricao).toContain("preço acordado");
    expect(e.faturamento.descricao).toContain("pedidos posteriormente cancelados");
    expect(e.reembolsos.descricao).toContain("cobertura é parcial");
  });
  it("mantém as explicações originais quando somente Mercado Livre está selecionado", () => {
    const originais = {};
    expect(explicacoesResumoVendas(["mercadolivre"], originais)).toBe(originais);
    expect(legendaResumoVendas(["mercadolivre"])).toContain("pela aprovação do pagamento");
    expect(legendaResumoVendas(["mercadolivre"])).not.toContain("Shopee");
  });
  it("mostra as duas regras quando o escopo reúne canais", () => {
    expect(legendaResumoVendas()).toContain("Shopee: valores dos produtos pela data de criação");
    expect(explicacoesResumoVendas(undefined, {}).totalBruto.descricao).toContain("No Mercado Livre, somente vendas com pagamento aprovado");
    expect(IndicadorPedidosSchema.parse("pendentes-confirmacao")).toBe("pendentes-confirmacao");
  });
});
