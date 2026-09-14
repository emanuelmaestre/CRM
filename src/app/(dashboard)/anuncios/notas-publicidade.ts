import { CalendarClock, Coins, Gauge, PieChart, ShoppingCart } from "lucide-react";
import anunciosConfig from "@/config/anuncios.json";
import type { AssuntoNota, NotaNaoSeAplica } from "@/shared/components/notas/tipos";

/* Notas da Publicidade. Os textos que também aparecem no ⓘ dos indicadores
   (receita por canal, TACOS da Shopee, janela de 7 dias) são lidos das mesmas
   constantes que a tela usa, para os dois lugares nunca divergirem. */

export const TACOS_SHOPEE_SEM_ORGANICO = "A Shopee não informa venda orgânica no relatório de Publicidade. Ela devolve apenas o que veio de anúncio. Sem a receita orgânica falta metade da conta do TACOS, que compara o investimento com a receita TOTAL do canal. Por isso ele fica sem dado aqui, e não por falta de vendas. No Mercado Livre o número aparece normalmente.";

const kpi = anunciosConfig.kpis;
const CAMINHO = "Publicidade → selecione a empresa e o canal";
const SEM_TIKTOK: NotaNaoSeAplica = {
  naoSeAplica: "O TikTok Shop não tem publicidade integrada ao CRM. Os números desta tela são só do Mercado Livre e da Shopee.",
};
const PAINEL_ML = "Mercado Livre → Publicidade → Product Ads → Relatórios, com o mesmo período";
const PAINEL_SHOPEE = "Seller Center da Shopee → Marketing → Anúncios Shopee → Visão geral, com o mesmo período";

function cardDe(rotulo: string) {
  return rotulo.split(" (")[0];
}

export function notasPublicidade(): AssuntoNota[] {
  return [
    {
      id: "receita",
      grupo: "Resultado",
      titulo: "Receita atribuída",
      icone: Coins,
      resumo: "É a métrica que mais muda entre os canais: o Mercado Livre credita só a venda do anúncio, a Shopee credita a loja inteira por 7 dias.",
      canais: {
        mercadolivre: {
          ondeVer: `${CAMINHO} Mercado Livre → card "${cardDe(kpi.receita)}" (ⓘ ao lado do nome).`,
          significado: `${anunciosConfig.receitaPorCanal.mercadolivre} Não é lucro: não desconta investimento, custo, taxas, frete nem impostos.`,
          painelOficial: `${PAINEL_ML} → Receita (vendas por publicidade).`,
          bateComPainel: "Deve bater, porque o CRM consulta o Mercado Livre na hora.",
          aConfirmar: true,
        },
        shopee: {
          ondeVer: `${CAMINHO} Shopee → card "${cardDe(kpi.receita)}" (ⓘ ao lado do nome).`,
          significado: `${anunciosConfig.receitaPorCanal.shopee} Pode incluir produtos diferentes do anunciado, por isso costuma parecer maior que a do Mercado Livre.`,
          painelOficial: `${PAINEL_SHOPEE} → GMV.`,
          bateComPainel: "Deve bater com o GMV do painel no dia da última sincronização. Os últimos 7 dias ainda sobem nos dois lugares.",
          aConfirmar: true,
        },
        tiktokshop: SEM_TIKTOK,
      },
    },
    {
      id: "vendas",
      grupo: "Resultado",
      titulo: "Vendas atribuídas",
      icone: ShoppingCart,
      resumo: "Quantas vendas o canal colocou na conta do anúncio. A regra de atribuição é a de cada canal.",
      canais: {
        mercadolivre: {
          ondeVer: `${CAMINHO} Mercado Livre → card "${cardDe(kpi.vendas)}".`,
          significado: "Unidades vendidas que o Mercado Livre atribuiu à publicidade, creditadas no dia do clique. Vendas orgânicas não entram. Atribuída não quer dizer que o anúncio foi o único motivo da compra.",
          painelOficial: `${PAINEL_ML} → Vendas.`,
          aConfirmar: true,
        },
        shopee: {
          ondeVer: `${CAMINHO} Shopee → card "${cardDe(kpi.vendas)}".`,
          significado: "Unidades que a Shopee atribuiu à publicidade até 7 dias depois do clique, contando a compra de qualquer produto da loja.",
          painelOficial: `${PAINEL_SHOPEE} → Itens vendidos.`,
          bateComPainel: "Os dias mais recentes ainda podem subir, porque a venda entra depois.",
          aConfirmar: true,
        },
        tiktokshop: SEM_TIKTOK,
      },
    },
    {
      id: "roas",
      grupo: "Eficiência",
      titulo: "ROAS e ACOS",
      icone: Gauge,
      resumo: "Os dois dependem da receita atribuída. Como a receita é medida diferente em cada canal, o ROAS de um canal não se compara com o do outro.",
      canais: {
        mercadolivre: {
          ondeVer: `${CAMINHO} Mercado Livre → cards "${cardDe(kpi.roas)}" e "${cardDe(kpi.acos)}".`,
          significado: "ROAS = receita atribuída ÷ investimento. ACOS = investimento ÷ receita atribuída. Acima de 1x no ROAS a mídia se pagou, mas isso não é lucro.",
          painelOficial: `${PAINEL_ML} → ROAS e ACOS.`,
          aConfirmar: true,
        },
        shopee: {
          ondeVer: `${CAMINHO} Shopee → cards "${cardDe(kpi.roas)}" e "${cardDe(kpi.acos)}".`,
          significado: "Mesma conta, mas com a receita ampla da Shopee (loja inteira, 7 dias). Por isso o ROAS costuma parecer maior e não é comparável ao do Mercado Livre.",
          painelOficial: `${PAINEL_SHOPEE} → ROAS e ACOS.`,
          aConfirmar: true,
        },
        tiktokshop: SEM_TIKTOK,
      },
    },
    {
      id: "tacos",
      grupo: "Eficiência",
      titulo: "TACOS",
      icone: PieChart,
      resumo: "Precisa da venda orgânica do canal. O Mercado Livre informa; a Shopee não.",
      canais: {
        mercadolivre: {
          ondeVer: `${CAMINHO} Mercado Livre → card "${cardDe(kpi.tacos)}".`,
          significado: "Investimento ÷ receita total do canal (anúncios + vendas orgânicas). Mostra o peso da mídia no negócio inteiro.",
          painelOficial: `${PAINEL_ML} → TACOS.`,
          aConfirmar: true,
        },
        shopee: {
          ondeVer: `${CAMINHO} Shopee → card "${cardDe(kpi.tacos)}" (aparece sem dado).`,
          significado: TACOS_SHOPEE_SEM_ORGANICO,
          painelOficial: "Não existe TACOS no painel de Anúncios da Shopee.",
          aConfirmar: true,
        },
        tiktokshop: SEM_TIKTOK,
      },
    },
    {
      id: "atualizacao",
      grupo: "Atualização",
      titulo: "De quando é cada número",
      icone: CalendarClock,
      resumo: "O Mercado Livre é consultado na hora. A Shopee chega por sincronização diária e ainda credita vendas por 7 dias.",
      canais: {
        mercadolivre: {
          ondeVer: `${CAMINHO} Mercado Livre → botão Período.`,
          significado: "Os números são buscados no Mercado Livre no momento em que a tela abre, para o período escolhido.",
          painelOficial: PAINEL_ML,
          bateComPainel: "Com o mesmo período, deve bater.",
          aConfirmar: true,
        },
        shopee: {
          ondeVer: `${CAMINHO} Shopee → botão Período e o aviso "${anunciosConfig.janela.titulo}".`,
          significado: anunciosConfig.janela.descricao.replaceAll("{dias}", "7"),
          painelOficial: PAINEL_SHOPEE,
          bateComPainel: "Pode ficar abaixo do painel nos últimos 7 dias até a próxima sincronização.",
          aConfirmar: true,
        },
        tiktokshop: SEM_TIKTOK,
      },
    },
  ];
}
