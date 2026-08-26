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
