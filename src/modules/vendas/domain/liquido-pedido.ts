/** Repasse líquido de um pedido — a regra, num lugar só.
 *
 *  Existem duas fontes possíveis e elas não valem o mesmo:
 *
 *  1. `valorLiquido` é o número que o próprio canal fechou (na Shopee, o
 *     `escrow_amount` de `payment/get_escrow_detail_batch`). Já vem com
 *     subsídio de frete, tarifa de campanha, taxa de transação e ajustes que
 *     não têm coluna nossa. Quando existe, é ele e ponto.
 *
 *  2. Sem esse dado — Mercado Livre e os canais manuais, que não expõem
 *     repasse — sobra reconstruir: total menos as taxas que conhecemos por
 *     item, menos o frete. É uma aproximação por cima, e é assim que deve ser
 *     lida: não desconta desconto/acréscimo nem custo do produto.
 *
 *  Medido em 28/08/2026 sobre os 1.009 pedidos da Shopee já reconciliados, a
 *  distância entre as duas é grande: a estimativa dava R$ 29.291,42 e o escrow
 *  dá R$ 26.573,56 — R$ 2.717,86 de lucro que nunca existiu, 9% a mais. Por
 *  isso a preferência pela fonte 1 não é preciosismo.
 *
 *  A mesma regra roda em SQL no resumo de Vendas (`LIQUIDO_DO_PEDIDO`, em
 *  `pedidos.repository.ts`), porque lá a soma é do banco. Mexeu aqui, mexa lá:
 *  os dois números aparecem na mesma tela e precisam fechar. */
export function liquidoDoPedido(entrada: {
  total: string | number;
  frete?: string | number | null;
  valorLiquido?: string | number | null;
  taxasConhecidas: number;
}): number {
  if (entrada.valorLiquido != null && entrada.valorLiquido !== "") {
    return Number(entrada.valorLiquido);
  }
  return Number(entrada.total) - entrada.taxasConhecidas - Number(entrada.frete ?? 0);
}

/** O líquido veio do canal ou foi reconstruído por nós? A tela precisa saber:
 *  quem confere o CRM contra o extrato do canal tem que distinguir um erro
 *  nosso de uma limitação da fonte. */
export function liquidoFoiInformado(valorLiquido: unknown): boolean {
  return valorLiquido != null && valorLiquido !== "";
}
