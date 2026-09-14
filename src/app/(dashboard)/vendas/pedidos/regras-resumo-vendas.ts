import type { ExplicacaoCardVendas } from "./card-resumo-vendas";

/** Explica os filtros atuais e distingue o status operacional do recorte financeiro. */
export const LEGENDA_STATUS_PEDIDOS: Array<{ titulo: string; cor: string; texto: string }> = [
  { titulo: "Todos", cor: "var(--muted-foreground)", texto: "Mostra todos os status, mantendo os filtros de empresa, canal, período e busca. Inclui também Entregue, Avaliação solicitada, Concluído e Devolvido quando registrados no sistema." },
  { titulo: "Em aberto", cor: "var(--info)", texto: "Agrupa Criado, Pago, Separado e Enviado. Não significa pagamento pendente: pedidos pagos também aparecem aqui. No Mercado Livre, um pedido pode permanecer como Pago sem que esse status informe se a entrega já aconteceu." },
  { titulo: "Cancelado", cor: "var(--destructive)", texto: "Mostra os pedidos registrados como Cancelado, com ou sem pagamento anterior. Shopee e TikTok incluem ambos no card de cancelamentos. No Mercado Livre, o card exige evidência de pagamento. Pedidos com status Devolvido ficam em Todos, fora deste filtro." },
  { titulo: "Reembolso parcial", cor: "var(--warning)", texto: "É um ajuste de valor, não uma opção do filtro de status. O pedido pode continuar como Pago ou em outra etapa faturável. O cartão Reembolsos parciais mostra a parcela devolvida e abre a lista dos pedidos afetados." },
];

export const EXPLICACOES_CARDS: Record<string, ExplicacaoCardVendas> = {
  totalBruto: {
    titulo: "o total bruto comparável",
    descricao: "Valor original das vendas. No Mercado Livre, o período considera a aprovação do pagamento, em Brasília, e exclui cancelamentos técnicos por divisão de pacote. Mantemos os centavos; o relatório do canal pode arredondar por dia.",
    calculo: "Faturamento confirmado mais valor cancelado ou devolvido mais valor dos reembolsos parciais.",
    inclui: [
      "O valor original dos pedidos com pagamento confirmado.",
      "O valor completo dos pedidos cancelados ou devolvidos depois da confirmação do pagamento.",
      "A parcela reembolsada que precisa ser somada de volta para reconstruir o valor original.",
    ],
    naoInclui: [
      "Pedidos criados que ainda não tiveram pagamento confirmado.",
      "Pedidos cancelados antes da confirmação do pagamento.",
      "Pedidos que o canal ainda não entregou ou que ainda não foram importados.",
      "Registros cancelados por divisão interna de pacote no Mercado Livre.",
    ],
  },
  faturamento: {
    titulo: "o faturamento confirmado",
    descricao: "Mostra a receita dos pedidos cujo pagamento foi confirmado pelo canal, descontando somente reembolsos parciais que a plataforma informou explicitamente.",
    calculo: "Soma do valor faturável de cada pedido. Em um reembolso parcial, valor faturável é o total do pedido menos a parcela reembolsada.",
    inclui: [
      "Pedidos pagos.",
      "Pedidos separados.",
      "Pedidos enviados.",
      "Pedidos entregues, concluídos ou com avaliação solicitada.",
    ],
    naoInclui: [
      "Pedidos criados ou aguardando pagamento.",
      "Pedidos cancelados.",
      "Pedidos devolvidos integralmente.",
      "A parcela de um pedido que já foi reembolsada.",
    ],
  },
  pedidos: {
    titulo: "a quantidade de pedidos faturados",
    descricao: "Conta quantos pedidos possuem pagamento confirmado. A quantidade representa pedidos, não produtos e não unidades vendidas.",
    calculo: "Cada pedido com status faturável conta uma vez, mesmo que possua vários itens ou um reembolso parcial.",
    inclui: [
      "Pedidos pagos, separados, enviados, entregues e concluídos.",
      "Pedidos com avaliação solicitada.",
      "Pedidos parcialmente reembolsados que continuam com valor faturável.",
    ],
    naoInclui: [
      "Quantidade de itens dentro do pedido.",
      "Pedidos criados sem pagamento confirmado.",
      "Pedidos cancelados ou devolvidos integralmente.",
    ],
  },
  cancelados: {
    titulo: "os cancelamentos e devoluções",
    descricao: "Mostra somente cancelamentos e devoluções que aconteceram depois de um pagamento aprovado.",
    calculo: "Soma do valor completo dos pedidos cancelados ou devolvidos que possuem evidência de pagamento anterior. A quantidade conta cada pedido uma vez.",
    inclui: [
      "Cancelamento solicitado pelo comprador depois do pagamento.",
      "Cancelamento realizado pelo vendedor depois do pagamento.",
      "Cancelamento automático depois do pagamento aprovado.",
      "Devolução integral de um pedido que havia sido pago.",
    ],
    naoInclui: [
      "Pedido cancelado ou expirado porque o cliente não pagou.",
      "Reembolso parcial de um pedido que continua faturável.",
      "Pedido apenas criado e ainda aguardando pagamento.",
      "Pedido ausente da sincronização.",
    ],
  },
  reembolsos: {
    titulo: "os reembolsos parciais",
    descricao: "Mostra somente a parte do dinheiro devolvida ao comprador quando o restante do pedido continua sendo receita.",
    calculo: "Soma dos valores positivos de reembolso informados nos pagamentos do pedido. Cada pedido afetado conta uma vez, mesmo que existam vários pagamentos.",
    inclui: [
      "Valor de reembolso informado explicitamente pela API do canal.",
      "Mais de um pagamento reembolsado dentro do mesmo pedido.",
      "Pedido ainda faturável depois do abatimento da parcela devolvida.",
    ],
    naoInclui: [
      "Campo ausente, nulo, textual ou inválido.",
      "Cancelamento ou devolução integral já contabilizada no card correspondente.",
      "Estimativa criada pelo CRM quando o canal não informou reembolso.",
    ],
  },
  quantidadeCancelados: {
    titulo: "os cancelados sem pagamento",
    descricao: "Pedidos cancelados em que o canal indica que o pagamento nunca foi aprovado (checkout abandonado ou expirado). São parte dos cancelamentos identificados, não uma quantidade adicional.",
    calculo: "Um registro por pedido cancelado sem pagamento, nos filtros selecionados. Casos sem informação suficiente ficam a verificar.",
    inclui: ["Cancelamentos sem pagamento identificados na Shopee, TikTok Shop e Mercado Livre."],
    naoInclui: ["Pedidos aguardando pagamento, devoluções e cancelados após pagamento.", "No Mercado Livre, esses casos não compõem os cards financeiros de vendas e cancelamentos pagos. Cancelamentos técnicos de divisão de pacote também ficam fora."],
  },
};

export const EXPLICACAO_PENDENTES: ExplicacaoCardVendas = {
  titulo: "os pedidos aguardando confirmação",
  descricao: "Pedidos da Shopee ou do TikTok Shop que já estão no Total bruto, mas ainda não têm pagamento confirmado pelo canal. Podem virar pagos ou ser cancelados.",
  calculo: "Soma do valor dos pedidos sem status de pagamento confirmado, nos filtros selecionados.",
  inclui: ["Pedidos aguardando pagamento ou verificação do canal."],
  naoInclui: ["Pedidos pagos, cancelados e devolvidos.", "Mercado Livre: o pedido só chega ao CRM depois do pagamento."],
};

export function legendaResumoVendas(canais: readonly string[] = []): string {
  const todos = canais.length === 0;
  const partes: string[] = [];
  if (todos || canais.includes("mercadolivre")) partes.push("Mercado Livre: vendas pela aprovação do pagamento");
  if (todos || canais.includes("shopee")) partes.push(canais.length === 1
    ? "Shopee: Pedido Feito pela criação; Produto Pago pela data do pagamento. Valores dos produtos, sem frete. A lista e os cancelamentos/devoluções usam a criação"
    : "Shopee: valores dos produtos pela data de criação");
  if (todos || canais.includes("tiktokshop")) partes.push(canais.length === 1 ? "TikTok Shop: GMV e pedidos pagos pela data do pagamento, incluindo cancelados e devolvidos após pagamento. Total bruto, lista e cancelamentos pela criação" : "TikTok Shop: pedidos pela data de criação");
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
  const somenteTikTok = canais?.length === 1 && canais[0] === "tiktokshop";
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
      descricao: somenteTikTok ? "GMV: valor pago no período do pagamento, incluindo pedidos posteriormente cancelados ou reembolsados. Não é repasse líquido nem receita após devoluções." : "Valor dos pedidos com pagamento confirmado, descontando reembolsos parciais informados pelo canal. Na Shopee, usa o valor dos produtos sem frete. Nos demais canais, o valor pago informado pela API pode incluir frete e acréscimos do comprador; o repasse líquido aparece separadamente.",
      ...(somenteTikTok ? {
        titulo: "a receita GMV do TikTok",
        calculo: "Total pago, com frete pago pelo comprador e descontos já aplicados, menos impostos. Não desconta reembolsos nem taxas do vendedor.",
        inclui: ["Pagamentos no período, mesmo de pedidos criados antes dele.", "Cancelados e devolvidos após pagamento."],
        naoInclui: ["Amostras gratuitas, pedidos não pagos e pagamentos fora do período.", "Subsídios somados novamente e repasses ao vendedor."],
      } : {}),
    },
    ...(somenteTikTok ? {pedidos: {...explicacoes.pedidos, descricao: "Pedidos do mesmo recorte de pagamento do GMV, excluindo amostras gratuitas. Inclui cancelados e devolvidos após pagamento.", calculo: "Um registro por número de pedido pago no período."}} : {}),
    cancelados: {
      titulo: "os cancelamentos e devoluções",
      descricao: "Shopee e TikTok Shop: pedidos cancelados ou devolvidos, inclusive cancelados sem pagamento. Reembolso integral concluído também sai da receita confirmada e entra como devolvido, mesmo que a entrega permaneça concluída. Na Shopee, usa o valor dos produtos; no TikTok, o total original informado pela API. Não equivale necessariamente ao dinheiro reembolsado." + regraML,
      calculo: "Soma do valor original dos pedidos cancelados e devolvidos. Cada pedido conta uma vez.",
      inclui: ["Shopee e TikTok: cancelamentos com ou sem pagamento e devoluções.", ...(misto ? ["Mercado Livre: cancelamentos e devoluções com evidência de pagamento."] : [])],
      naoInclui: ["Pedidos aguardando confirmação.", "Reembolsos parciais de pedidos que continuam confirmados."],
    },
  };
}
