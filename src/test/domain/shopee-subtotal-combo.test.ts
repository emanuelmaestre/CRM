import {describe,expect,it} from "vitest";
import {totalProdutosShopee} from "@/modules/canais/infrastructure/shopee.provider";

describe("subtotal Shopee com combo", () => {
  const itens = [
    {model_quantity_purchased: 1, model_discounted_price: 0, promotion_type: "bundle_deal"},
    {model_quantity_purchased: 2, model_discounted_price: 0, promotion_type: "bundle_deal"},
    {model_quantity_purchased: 1, model_discounted_price: 74.9},
  ];
  it("usa o subtotal oficial sem multiplicar novamente a quantidade do combo", () => {
    expect(totalProdutosShopee(itens, {order_discounted_price: 265.9})).toBe(265.9);
  });
  it("preserva a ingestão operacional quando o financeiro ainda não está disponível", () => {
    expect(totalProdutosShopee(itens)).toBe(74.9);
  });
  it("preserva zero oficial e preços de pedidos sem combo", () => {
    expect(totalProdutosShopee(itens, {order_discounted_price: 0})).toBe(0);
    expect(totalProdutosShopee([{model_quantity_purchased: 2,model_discounted_price: 0},{model_quantity_purchased: 1,model_discounted_price: 74.9}], {order_discounted_price: 100})).toBe(74.9);
  });
});
