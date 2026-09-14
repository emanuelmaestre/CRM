import { Ban, BadgeDollarSign, CalendarClock, CircleDollarSign, Clock, ListChecks, RotateCcw, ShoppingBag, Wallet, XCircle } from "lucide-react";
import type { AssuntoNota, CanalNota, NotaDoCanal } from "@/shared/components/notas/tipos";
import type { ExplicacaoCardVendas } from "./card-resumo-vendas";
import {
  EXPLICACAO_PENDENTES,
  EXPLICACOES_CARDS,
  LEGENDA_STATUS_PEDIDOS,
  explicacoesResumoVendas,
  legendaResumoVendas,
} from "./regras-resumo-vendas";

/* Notas de Vendas. O significado de cada card vem de `explicacoesResumoVendas`
   — a mesma função que monta o ⓘ do card com aquele canal selecionado —, então
   o wizard e o card leem o mesmo texto. Aqui só entra o que o card não tem:
   onde fica o número e onde conferir no painel do canal. */

const CAMINHO = "Vendas → selecione a empresa e só o canal";

function explicacaoDoCanal(canal: CanalNota, chave: string): ExplicacaoCardVendas {
  return explicacoesResumoVendas([canal], EXPLICACOES_CARDS)[chave] ?? EXPLICACOES_CARDS[chave];
}

function doCard(canal: CanalNota, chave: string, card: string, painel: Omit<NotaDoCanal, "ondeVer" | "significado">): NotaDoCanal {
  const explicacao = explicacaoDoCanal(canal, chave);
  return {
    ondeVer: `${CAMINHO} ${nome(canal)} → card "${card}". O ⓘ no canto do card mostra esta mesma explicação, e clicar no card abre a lista dos pedidos.`,
    significado: `${explicacao.descricao} Cálculo: ${explicacao.calculo}`,
    inclui: explicacao.inclui,
    naoInclui: explicacao.naoInclui,
    ...painel,
  };
}

function nome(canal: CanalNota) {
  return canal === "mercadolivre" ? "Mercado Livre" : canal === "shopee" ? "Shopee" : "TikTok Shop";
}

const PAINEL_ML_METRICAS = "Mercado Livre → Métricas → Negócio. Vendas brutas e Quantidade de vendas, com o mesmo período.";
const PAINEL_SHOPEE_DADOS = "Seller Center da Shopee → Dados do Negócio → Visão Geral";
const PAINEL_TIKTOK_ANALISES = "TikTok Shop Seller Center → Análises (Data Compass) → Visão geral";

export function notasVendas(): AssuntoNota[] {
  return [
    {
      id: "status",
      grupo: "Pedidos",
      titulo: "Status dos pedidos",
      icone: ListChecks,
      resumo: "O filtro de status é o mesmo para os três canais, mas cada canal marca pagamento e cancelamento de um jeito.",
      legenda: LEGENDA_STATUS_PEDIDOS,
      canais: {
        mercadolivre: {
          ondeVer: "Vendas → filtro de status (Todos, Em aberto, Cancelado), ao lado de Período.",
          significado: "O pedido só chega ao CRM depois de pago, então nunca aparece como Criado. Pago continua Pago mesmo depois de entregue: o status do pagamento não informa a etapa da entrega.",
          painelOficial: "Mercado Livre → Vendas. As abas separam por etapa do envio (a enviar, em trânsito, concluídas, canceladas).",
          bateComPainel: "O painel organiza pela entrega, o CRM pelo pagamento. A contagem por aba não bate com a do filtro.",
          aConfirmar: true,
        },
        shopee: {
          ondeVer: "Vendas → filtro de status, ao lado de Período.",
          significado: "Pedidos entram assim que são criados, inclusive os não pagos (status Criado). Cancelado inclui os que nunca foram pagos.",
          painelOficial: "Seller Center da Shopee → Meus Pedidos. Abas: Não pago, A enviar, Enviando, Concluído, Cancelado e Devolução/Reembolso.",
          bateComPainel: "Não pago da Shopee corresponde a Criado no CRM, que fica dentro de Em aberto.",
          aConfirmar: true,
        },
        tiktokshop: {
          ondeVer: "Vendas → filtro de status, ao lado de Período.",
          significado: "Pedidos entram assim que são criados, inclusive os aguardando pagamento. Cancelado inclui os que nunca foram pagos.",
          painelOficial: "TikTok Shop Seller Center → Pedidos → Gerenciar pedidos. Abas: Não pago, A enviar, Enviado, Concluído, Cancelado.",
          aConfirmar: true,
        },
      },
    },
    {
      id: "datas",
      grupo: "Pedidos",
      titulo: "Datas, horário e centavos",
      icone: CalendarClock,
      resumo: "Cada canal escolhe uma data diferente para dizer em que dia a venda aconteceu. É a causa mais comum de o número não bater com o painel.",
      canais: {
        mercadolivre: {
          ondeVer: `${CAMINHO} Mercado Livre → faixa de texto abaixo dos cards (só no computador).`,
          significado: `${legendaResumoVendas(["mercadolivre"])} Um pedido feito às 23h50 e aprovado às 0h10 entra no dia seguinte.`,
          painelOficial: PAINEL_ML_METRICAS,
          bateComPainel: "Deve bater, com diferença de centavos quando o painel arredonda por dia. Perto da meia-noite o ícone de fuso mostra os pedidos que mudam de dia.",
          aConfirmar: true,
        },
        shopee: {
          ondeVer: `${CAMINHO} Shopee → faixa de texto abaixo dos cards (só no computador).`,
          significado: legendaResumoVendas(["shopee"]),
          painelOficial: `${PAINEL_SHOPEE_DADOS}. Troque o seletor entre Pedido Feito e Pedido Pago para ver as duas datas.`,
          bateComPainel: "Pedido Feito compara com o card de pedidos feitos; Pedido Pago com o de produto pago.",
          aConfirmar: true,
        },
        tiktokshop: {
          ondeVer: `${CAMINHO} TikTok Shop → faixa de texto abaixo dos cards (só no computador).`,
          significado: legendaResumoVendas(["tiktokshop"]),
          painelOficial: `${PAINEL_TIKTOK_ANALISES}. O GMV do painel usa a data do pagamento.`,
          aConfirmar: true,
        },
      },
    },
    {
      id: "total-bruto",
      grupo: "Valores",
      titulo: "Total bruto",
      icone: BadgeDollarSign,
      resumo: "No Mercado Livre é o valor das vendas pagas; na Shopee e no TikTok é o valor de todos os pedidos criados, pagos ou não.",
      canais: {
        mercadolivre: doCard("mercadolivre", "totalBruto", "Total bruto comparável", {
          painelOficial: `${PAINEL_ML_METRICAS} Vendas brutas.`,
          bateComPainel: "Deve ficar próximo das Vendas brutas do painel.",
          aConfirmar: true,
        }),
        shopee: doCard("shopee", "totalBruto", "Vendas — pedidos feitos", {
          painelOficial: `${PAINEL_SHOPEE_DADOS} → Vendas, com o seletor em Pedido Feito.`,
          bateComPainel: "Deve bater com Vendas em Pedido Feito, porque os dois somam só o valor dos produtos, sem frete.",
          aConfirmar: true,
        }),
        tiktokshop: doCard("tiktokshop", "totalBruto", "Valor dos pedidos criados", {
          painelOficial: "TikTok Shop Seller Center → Pedidos → Gerenciar pedidos, filtrado pela data de criação.",
          bateComPainel: "Não existe card igual nas Análises, que usam a data do pagamento. Compare com a soma da lista de pedidos.",
          aConfirmar: true,
        }),
      },
    },
    {
      id: "faturamento",
      grupo: "Valores",
      titulo: "Faturamento e receita",
      icone: CircleDollarSign,
      resumo: "O card verde muda de nome e de regra: faturamento confirmado no Mercado Livre, produto pago na Shopee e GMV no TikTok.",
      canais: {
        mercadolivre: doCard("mercadolivre", "faturamento", "Faturamento confirmado", {
          painelOficial: `${PAINEL_ML_METRICAS}`,
          bateComPainel: "O painel não desconta reembolsos parciais e o CRM desconta, então o CRM pode ficar um pouco abaixo.",
          aConfirmar: true,
        }),
        shopee: doCard("shopee", "faturamento", "Vendas — produto pago", {
          painelOficial: `${PAINEL_SHOPEE_DADOS} → Vendas, com o seletor em Pedido Pago.`,
          bateComPainel: "Deve bater com Vendas em Pedido Pago.",
          aConfirmar: true,
        }),
        tiktokshop: doCard("tiktokshop", "faturamento", "Receita — GMV TikTok", {
          painelOficial: `${PAINEL_TIKTOK_ANALISES} → GMV.`,
          bateComPainel: "Deve bater com o GMV das Análises, que usa a mesma data de pagamento.",
          aConfirmar: true,
        }),
      },
    },
    {
      id: "pedidos",
      grupo: "Valores",
      titulo: "Quantidade de pedidos",
      icone: ShoppingBag,
      resumo: "Conta pedidos, não itens nem unidades. Na Shopee e no TikTok segue a mesma data do card verde.",
      canais: {
        mercadolivre: doCard("mercadolivre", "pedidos", "Pedidos faturados", {
          painelOficial: `${PAINEL_ML_METRICAS} Quantidade de vendas.`,
          bateComPainel: "O painel conta vendas; um carrinho com vários anúncios pode virar mais de uma venda lá.",
          aConfirmar: true,
        }),
        shopee: doCard("shopee", "pedidos", "Pedidos pagos", {
          painelOficial: `${PAINEL_SHOPEE_DADOS} → Pedidos, com o seletor em Pedido Pago.`,
          aConfirmar: true,
        }),
        tiktokshop: doCard("tiktokshop", "pedidos", "Pedidos pagos", {
          painelOficial: `${PAINEL_TIKTOK_ANALISES} → Pedidos (SKU orders).`,
          aConfirmar: true,
        }),
      },
    },
    {
      id: "cancelados",
      grupo: "Cancelamentos e devoluções",
      titulo: "Cancelamentos",
      icone: Ban,
      resumo: "No Mercado Livre só conta cancelado que tinha sido pago. Na Shopee e no TikTok conta com ou sem pagamento.",
      canais: {
        mercadolivre: doCard("mercadolivre", "cancelados", "Cancelados e devolvidos", {
          painelOficial: "Mercado Livre → Vendas → aba Canceladas.",
          bateComPainel: "A aba mostra todos os cancelamentos; o card só os pagos. O card fica menor.",
          aConfirmar: true,
        }),
        shopee: doCard("shopee", "cancelados", "Vendas canceladas", {
          painelOficial: "Seller Center da Shopee → Meus Pedidos → aba Cancelado, filtrada pela data do pedido.",
          bateComPainel: "O card separa quantos foram cancelados após pagamento e sem pagamento; a aba mostra os dois juntos.",
          aConfirmar: true,
        }),
        tiktokshop: doCard("tiktokshop", "cancelados", "Cancelados e devolvidos", {
          painelOficial: "TikTok Shop Seller Center → Pedidos → Gerenciar pedidos → aba Cancelado, e Devoluções para os devolvidos.",
          aConfirmar: true,
        }),
      },
    },
    {
      id: "devolucoes",
      grupo: "Cancelamentos e devoluções",
      titulo: "Devoluções e reembolsos",
      icone: RotateCcw,
      resumo: "Mercado Livre e TikTok mostram reembolso parcial informado pela API. Na Shopee o card mostra devoluções conhecidas, com cobertura parcial.",
      canais: {
        mercadolivre: doCard("mercadolivre", "reembolsos", "Reembolsos parciais", {
          painelOficial: "Mercado Livre → Vendas → abra a venda → Pagamentos. O reembolso aparece no detalhe do pagamento.",
          aConfirmar: true,
        }),
        shopee: {
          ...doCard("shopee", "reembolsos", "Devoluções conhecidas", {
            painelOficial: "Seller Center da Shopee → Meus Pedidos → Devolução/Reembolso.",
            bateComPainel: "Não use o card como conferência: o CRM só vê as devoluções que a API informa. O quadro abaixo dos cards avisa sobre essa cobertura parcial.",
            aConfirmar: true,
          }),
        },
        tiktokshop: doCard("tiktokshop", "reembolsos", "Reembolsos parciais", {
          painelOficial: "TikTok Shop Seller Center → Pedidos → Devoluções e reembolsos.",
          aConfirmar: true,
        }),
      },
    },
    {
      id: "cancelados-sem-pagamento",
      grupo: "Cancelamentos e devoluções",
      titulo: "Cancelados sem pagamento",
      icone: XCircle,
      resumo: "Pedidos que o comprador abandonou antes de pagar. Já estão dentro dos cancelamentos e não devem ser somados de novo.",
      canais: {
        mercadolivre: doCard("mercadolivre", "quantidadeCancelados", "Cancelados sem pagamento", {
          painelOficial: "Mercado Livre → Vendas → aba Canceladas, nas vendas sem pagamento aprovado.",
          bateComPainel: "Esses pedidos não entram em nenhum total financeiro do Mercado Livre no CRM.",
          aConfirmar: true,
        }),
        shopee: doCard("shopee", "quantidadeCancelados", "Cancelados sem pagamento", {
          painelOficial: "Seller Center da Shopee → Meus Pedidos → aba Cancelado, pedidos sem data de pagamento.",
          aConfirmar: true,
        }),
        tiktokshop: doCard("tiktokshop", "quantidadeCancelados", "Cancelados sem pagamento", {
          painelOficial: "TikTok Shop Seller Center → Pedidos → aba Cancelado, pedidos que nunca saíram de Não pago.",
          aConfirmar: true,
        }),
      },
    },
    {
      id: "pendentes",
      grupo: "Cancelamentos e devoluções",
      titulo: "Aguardando pagamento",
      icone: Clock,
      resumo: "Só existe na Shopee e no TikTok, porque o Mercado Livre só entrega o pedido depois de pago.",
      canais: {
        mercadolivre: {
          naoSeAplica: "O Mercado Livre só envia o pedido ao CRM depois do pagamento aprovado, então esse card fica sempre zerado com ele.",
        },
        shopee: {
          ondeVer: `${CAMINHO} Shopee → card "Aguardando confirmação".`,
          significado: `${EXPLICACAO_PENDENTES.descricao} Na Shopee, o status UNPAID aparece como aguardando pagamento; sem esse status, fica a verificar.`,
          inclui: EXPLICACAO_PENDENTES.inclui,
          naoInclui: EXPLICACAO_PENDENTES.naoInclui,
          painelOficial: "Seller Center da Shopee → Meus Pedidos → aba Não pago.",
          bateComPainel: "Não entram em Produto Pago.",
          aConfirmar: true,
        },
        tiktokshop: {
          ondeVer: `${CAMINHO} TikTok Shop → card "Aguardando confirmação".`,
          significado: EXPLICACAO_PENDENTES.descricao,
          inclui: EXPLICACAO_PENDENTES.inclui,
          naoInclui: EXPLICACAO_PENDENTES.naoInclui,
          painelOficial: "TikTok Shop Seller Center → Pedidos → aba Não pago.",
          bateComPainel: "Não entram no GMV.",
          aConfirmar: true,
        },
      },
    },
    {
      id: "liquido",
      grupo: "Dinheiro",
      titulo: "Líquido e repasse",
      icone: Wallet,
      resumo: "Shopee e TikTok informam quanto repassam ao vendedor. O Mercado Livre não informa, e o CRM estima.",
      canais: {
        mercadolivre: {
          ondeVer: `${CAMINHO} Mercado Livre → linha "líquido" abaixo do valor do card "Faturamento confirmado". Por pedido: abra o pedido → linha "Valor líquido" do resumo de valores.`,
          significado: "É uma estimativa: valor da venda menos as taxas conhecidas por item e o frete pago pelo vendedor. Quando aparece \"inclui estimativas\", parte dos pedidos não tinha taxa informada.",
          painelOficial: "Mercado Livre → Mercado Pago → Atividade, ou Faturamento → Relatório de vendas, para o valor que caiu na conta.",
          bateComPainel: "Tende a ficar um pouco acima do que cai na conta, porque o CRM não vê todos os descontos.",
          aConfirmar: true,
        },
        shopee: {
          ondeVer: "Vendas → abra um pedido da Shopee → linha \"Valor líquido\" do resumo de valores.",
          significado: "É o repasse calculado pela própria Shopee para aquele pedido (escrow). Depois do pagamento existe um prazo de carência antes da liberação.",
          painelOficial: "Seller Center da Shopee → Minha Renda (Finanças) → A liberar / Liberado, procurando o número do pedido.",
          bateComPainel: "Deve bater por pedido.",
          aConfirmar: true,
        },
        tiktokshop: {
          ondeVer: `${CAMINHO} TikTok Shop → quadro abaixo dos cards (só no computador): "Repasse apurado" e quantos pedidos estão "sem liquidação".`,
          significado: "Soma do repasse lido do extrato do TikTok para os pedidos criados no período. Pedido sem liquidação ainda não foi repassado e conta como zero. Usa a data de criação, por isso não pode ser somado ao GMV.",
          painelOficial: "TikTok Shop Seller Center → Finanças → Extratos (Statements).",
          bateComPainel: "O extrato agrupa por data de liquidação; o CRM, pela criação do pedido. Confira pedido a pedido.",
          aConfirmar: true,
        },
      },
    },
  ];
}
