/* ── Plataformas de Product Ads ───────────────────────────────────
   O módulo Anúncios nasceu só com o Mercado Livre. Desde 26/08/2026 as
   mesmas tabelas de snapshot guardam também as campanhas da Shopee, e o que
   separa uma coisa da outra é a coluna `plataforma` (ver schema/anuncios.ts).

   Toda leitura do módulo filtra por uma plataforma — nunca por nenhuma. Somar
   Mercado Livre e Shopee no mesmo ROAS misturaria duas moedas de atribuição
   diferentes (a Shopee atribui vendas em 7 dias após o clique, o Mercado
   Livre não usa essa janela), e o número resultante não significaria nada.
   Comparação entre canais é uma tela, não um total. */

export const PLATAFORMAS_ANUNCIOS = ["mercadolivre", "shopee"] as const;

export type PlataformaAnuncios = (typeof PLATAFORMAS_ANUNCIOS)[number];

/** Default de toda consulta que não escolhe explicitamente. Mantém o
 *  comportamento que as telas já tinham antes da Shopee existir aqui. */
export const PLATAFORMA_ANUNCIOS_PADRAO: PlataformaAnuncios = "mercadolivre";

export function ehPlataformaAnuncios(valor: string | null | undefined): valor is PlataformaAnuncios {
  return PLATAFORMAS_ANUNCIOS.includes(valor as PlataformaAnuncios);
}

/* ── Janela padrão de leitura ──────────────────────────────────────
   "Sem período escolhido" não significa a mesma coisa nos dois canais.

   O Mercado Livre fecha a venda no dia do clique: o dia mais recente já é
   uma leitura legítima, e é o que o módulo sempre mostrou.

   A Shopee atribui a venda até 7 dias DEPOIS do clique (é a mesma janela que
   `DIAS_ATUALIZACAO_SHOPEE` reescreve na sincronização). O dia de hoje, nela,
   tem o gasto inteiro e quase nenhuma receita — não porque o anúncio foi mal,
   mas porque a venda ainda não foi contabilizada. Medido em 28/08/2026: hoje
   R$ 1,57 investidos e R$ 0,00 de receita; 26/08, já fora da janela viva,
   R$ 70,31 investidos e R$ 367,10 de receita. Abrir a tela no dia de hoje
   mostrava ROAS zero com 90 dias de dado saudável logo atrás.

   Por isso a janela padrão é do CANAL, não da tela. */

export const DIAS_JANELA_PADRAO: Record<PlataformaAnuncios, number> = {
  mercadolivre: 1,
  shopee: 7,
};

/** Dias que o canal ainda pode creditar a uma venda depois do clique. Zero
 *  no Mercado Livre. É o que as telas usam para avisar que os dias mais
 *  recentes ainda vão subir — sem isso, "ROAS caiu" e "a venda ainda não
 *  entrou" ficam com a mesma cara. */
export const DIAS_ATRIBUICAO: Record<PlataformaAnuncios, number> = {
  mercadolivre: 0,
  shopee: 7,
};

export function diasJanelaPadrao(plataforma: PlataformaAnuncios): number {
  return DIAS_JANELA_PADRAO[plataforma] ?? 1;
}

/** Primeiro dia da janela padrão que termina em `fim` (ISO, `YYYY-MM-DD`).
 *  A janela conta o próprio `fim`: 7 dias terminando em 28/08 começa em 22/08.
 *  Aritmética em UTC de propósito — as datas aqui são colunas `date`, sem
 *  hora nenhuma, e passar pelo fuso local deslocaria a janela em um dia. */
export function inicioDaJanelaPadrao(fim: string, plataforma: PlataformaAnuncios): string {
  const dias = diasJanelaPadrao(plataforma);
  const data = new Date(`${fim}T00:00:00Z`);
  if (Number.isNaN(data.getTime())) return fim;
  data.setUTCDate(data.getUTCDate() - (dias - 1));
  return data.toISOString().slice(0, 10);
}

/** Marketplaces que informam a venda ORGÂNICA no relatório de publicidade.
 *  A Shopee não: o relatório de Ads dela só devolve o que veio de anúncio.
 *  Gravamos null em vez de zero (ver sincronizacao-shopee.service.ts), e é
 *  por isso que TACOS e dependência de mídia ficam sem dado lá — informação
 *  ausente, não resultado ruim. As telas usam isto para dizer qual dos dois
 *  é o caso, em vez de mostrarem o mesmo vazio para as duas coisas. */
export const EXPOE_VENDA_ORGANICA: Record<PlataformaAnuncios, boolean> = {
  mercadolivre: true,
  shopee: false,
};
