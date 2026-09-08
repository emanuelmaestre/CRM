import type { ExplicacaoCardVendas } from "./card-resumo-vendas";

export function legendaResumoVendas(canais: readonly string[] = []): string {
  const todos = canais.length === 0;
  const partes: string[] = [];
  if (todos || canais.includes("mercadolivre")) partes.push("Mercado Livre: vendas pela aprovação do pagamento");
  if (todos || canais.includes("shopee")) partes.push("Shopee: pedidos pela data de criação");
  if (todos || canais.includes("tiktokshop")) partes.push("TikTok Shop: pedidos pela data de criação");
  return `${partes.join(". ")}. Horários de Brasília. Valores com centavos.`;
}

export function explicacoesResumoVendas(
  canais: readonly string[] | undefined,
  explicacoes: Record<string, ExplicacaoCardVendas>,
): Record<string, ExplicacaoCardVendas> {
  if (canais?.length && !canais.some((canal) => canal === "shopee" || canal === "tiktokshop")) return explicacoes;
  const misto = !canais?.length || canais.includes("mercadolivre");
  const regraML = misto ? " No Mercado Livre, somente vendas com pagamento aprovado e seus ajustes entram no bruto." : "";
  return {
    ...explicacoes,
    totalBruto: {
      titulo: "o total bruto de pedidos",
      descricao: "Shopee e TikTok Shop: valor original informado pela API de todos os pedidos conectados no período de criação, em Brasília, inclusive não pagos e cancelados. Não representa receita confirmada. Relatórios que zeram cancelamentos ou excluem acréscimos usam outra base de comparação." + regraML,
      calculo: "Confirmado + cancelados/devolvidos + reembolsos parciais + pedidos ainda sem confirmação.",
      inclui: ["Cada pedido uma vez, independentemente da quantidade de itens.", "Shopee e TikTok: pedidos pendentes e cancelamentos com ou sem pagamento."],
      naoInclui: ["Pedidos fora dos filtros de empresa, canal, período, status e busca.", "Pedidos ainda não importados.", ...(misto ? ["Mercado Livre: pedidos sem pagamento e cancelamentos técnicos por divisão de pacote."] : [])],
    },
    faturamento: {
      ...explicacoes.faturamento,
      descricao: "Valor dos pedidos com pagamento confirmado, descontando reembolsos parciais informados pelo canal. O valor pago informado pela API pode incluir frete e acréscimos do comprador; o repasse líquido aparece separadamente.",
    },
    cancelados: {
      titulo: "os cancelamentos e devoluções",
      descricao: "Shopee e TikTok Shop: pedidos cancelados ou devolvidos, inclusive cancelados sem pagamento. Reembolso integral concluído também sai da receita confirmada e entra como devolvido, mesmo que a entrega permaneça concluída. O valor é o total original do pedido informado pela API, não necessariamente dinheiro reembolsado." + regraML,
      calculo: "Soma do valor original dos pedidos cancelados e devolvidos. Cada pedido conta uma vez.",
      inclui: ["Shopee e TikTok: cancelamentos com ou sem pagamento e devoluções.", ...(misto ? ["Mercado Livre: cancelamentos e devoluções com evidência de pagamento."] : [])],
      naoInclui: ["Pedidos aguardando confirmação.", "Reembolsos parciais de pedidos que continuam confirmados."],
    },
    quantidadeCancelados: {
      ...explicacoes.quantidadeCancelados,
      naoInclui: ["Unidades e produtos dentro do pedido.", "Reembolsos parciais.", ...(misto ? ["Mercado Livre: cancelamentos sem pagamento."] : [])],
    },
  };
}
