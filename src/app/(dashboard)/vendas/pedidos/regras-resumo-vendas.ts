import type { ExplicacaoCardVendas } from "./card-resumo-vendas";

export function legendaResumoVendas(canais: readonly string[] = []): string {
  const todos = canais.length === 0;
  const partes: string[] = [];
  if (todos || canais.includes("mercadolivre")) partes.push("Mercado Livre: vendas pela aprovação do pagamento");
  if (todos || canais.includes("shopee")) partes.push(canais.length === 1
    ? "Shopee: Pedido Feito pela criação; Produto Pago pela data do pagamento. Valores dos produtos, sem frete. A lista e os cancelamentos/devoluções usam a criação"
    : "Shopee: valores dos produtos pela data de criação");
  if (todos || canais.includes("tiktokshop")) partes.push("TikTok Shop: pedidos pela data de criação");
  return `${partes.join(". ")}. Horários de Brasília. Valores com centavos.`;
}

export function explicacoesResumoVendas(
  canais: readonly string[] | undefined,
  explicacoes: Record<string, ExplicacaoCardVendas>,
): Record<string, ExplicacaoCardVendas> {
  if (canais?.length === 1 && canais[0] === "shopee") return {
    ...explicacoes,
    totalBruto: {
      titulo: "as vendas de pedidos feitos",
      descricao: "Soma do preço acordado dos produtos dos pedidos criados no período, incluindo não pagos e cancelados. Corresponde ao filtro Pedido Feito da Shopee.",
      calculo: "Preço acordado de cada item multiplicado pela quantidade, somado uma única vez por pedido.",
      inclui: ["Pedidos criados no período de Brasília, nos filtros selecionados."],
      naoInclui: ["Frete, taxas do checkout e repasses ao vendedor."],
    },
    faturamento: {
      titulo: "as vendas de produtos pagos",
      descricao: "Valor dos produtos com pagamento registrado pela Shopee no período. Inclui pagamentos de pedidos criados antes do período e pedidos posteriormente cancelados ou devolvidos. Não é receita líquida preservada.",
      calculo: "Soma dos produtos pela data oficial do pagamento, antes de deduzir cancelamentos e reembolsos.",
      inclui: ["Pedidos com data de pagamento informada pela Shopee."],
      naoInclui: ["Pedidos sem data de pagamento, frete e taxas do checkout."],
    },
    pedidos: {
      ...explicacoes.pedidos,
      descricao: "Quantidade de pedidos com pagamento informado no período, inclusive os posteriormente cancelados ou devolvidos. Usa a mesma seleção de Produto Pago.",
      calculo: "Um registro por número de pedido pago no período.",
    },
    cancelados: {
      ...explicacoes.cancelados,
      descricao: "Valor dos produtos dos pedidos criados no período e cancelados, com ou sem pagamento. Corresponde aos cancelamentos do filtro Pedido Feito, não ao dinheiro efetivamente reembolsado.",
      calculo: "Soma dos produtos dos pedidos cancelados criados no período.",
      inclui: ["Cancelamentos com ou sem pagamento."],
      naoInclui: ["Devoluções, frete e taxas do checkout."],
    },
    reembolsos: {
      ...explicacoes.reembolsos,
      titulo: "as devoluções conhecidas",
      descricao: "Valor dos produtos dos pedidos criados no período cujo estado conhecido é devolvido. A cobertura é parcial. Não equivale ao valor efetivamente reembolsado e zero não comprova ausência de devoluções na Shopee.",
      calculo: "Soma dos produtos dos pedidos reconhecidos como devolvidos.",
      inclui: ["Pedidos com estado de devolução conhecido pelo CRM."],
      naoInclui: ["Casos não disponibilizados pela integração e reembolsos sem mudança no estado do pedido."],
    },
    quantidadeCancelados: {
      ...explicacoes.quantidadeCancelados,
      titulo: "os cancelados sem pagamento",
      descricao: "Parte dos pedidos cancelados que não teve pagamento registrado pela Shopee. Já está incluída no total de cancelamentos; não deve ser somada novamente. Registros ainda não consultados ficam a verificar.",
      calculo: "Um registro por pedido cancelado, criado no período, com consulta de pagamento realizada e sem data de pagamento.",
      inclui: ["Cancelamentos sem pagamento confirmado pela consulta à Shopee."],
      naoInclui: ["Cancelados após pagamento, devoluções e pedidos ainda aguardando pagamento."],
    },
  };
  if (canais?.length && !canais.some((canal) => canal === "shopee" || canal === "tiktokshop")) return explicacoes;
  const misto = !canais?.length || canais.includes("mercadolivre");
  const regraML = misto ? " No Mercado Livre, somente vendas com pagamento aprovado e seus ajustes entram no bruto." : "";
  return {
    ...explicacoes,
    totalBruto: {
      titulo: "o total bruto de pedidos",
      descricao: "Shopee: valor dos produtos, sem frete. TikTok Shop: valor original informado pela API. Ambos incluem os pedidos conectados no período de criação, em Brasília, inclusive não pagos e cancelados. Não representa receita confirmada." + regraML,
      calculo: "Confirmado + cancelados/devolvidos + reembolsos parciais + pedidos ainda sem confirmação.",
      inclui: ["Cada pedido uma vez, independentemente da quantidade de itens.", "Shopee e TikTok: pedidos pendentes e cancelamentos com ou sem pagamento."],
      naoInclui: ["Pedidos fora dos filtros de empresa, canal, período, status e busca.", "Pedidos ainda não importados.", ...(misto ? ["Mercado Livre: pedidos sem pagamento e cancelamentos técnicos por divisão de pacote."] : [])],
    },
    faturamento: {
      ...explicacoes.faturamento,
      descricao: "Valor dos pedidos com pagamento confirmado, descontando reembolsos parciais informados pelo canal. Na Shopee, usa o valor dos produtos sem frete. Nos demais canais, o valor pago informado pela API pode incluir frete e acréscimos do comprador; o repasse líquido aparece separadamente.",
    },
    cancelados: {
      titulo: "os cancelamentos e devoluções",
      descricao: "Shopee e TikTok Shop: pedidos cancelados ou devolvidos, inclusive cancelados sem pagamento. Reembolso integral concluído também sai da receita confirmada e entra como devolvido, mesmo que a entrega permaneça concluída. Na Shopee, usa o valor dos produtos; no TikTok, o total original informado pela API. Não equivale necessariamente ao dinheiro reembolsado." + regraML,
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
