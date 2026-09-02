/** Erros de domínio da ingestão de pedidos.
 *
 *  Mora aqui, e não em `application/ingestao-pedido.service.ts`, porque aquele
 *  arquivo é `"use server"`: o Next só aceita funções async exportadas de um
 *  módulo assim, e exportar uma classe dali derruba TODOS os exports do módulo
 *  no build ("The module has no exports at all") — o `tsc --noEmit` passa
 *  limpo, então isso só aparece em `next build`. Aconteceu de verdade em
 *  25/08/2026: o deploy quebrou, a produção seguiu servindo o código antigo e
 *  o bug parecia "não ter sido corrigido". */

/** Pedido que veio do canal com um SKU que não existe na marca — anúncio
 *  despublicado depois da venda, ou produto que nunca foi importado.
 *
 *  É um erro *daquele pedido*, não da conta: quem faz o polling (A24) e a
 *  sincronização manual (A31) pulam o pedido e seguem para os próximos, em vez
 *  de derrubar a leva inteira. Uma venda antiga de um anúncio removido
 *  impedia, sozinha, que qualquer pedido da conta entrasse. Mesma ideia das
 *  "pendências" da importação histórica, que já registra `sku_nao_mapeado` por
 *  item em vez de abortar o lote. */
export class ErroSkuSemProduto extends Error {
  readonly skus: string[];
  constructor(skus: string[]) {
    super(`Pedido não importado: SKUs sem produto na marca: ${skus.join(", ")}.`);
    this.name = "ErroSkuSemProduto";
    this.skus = skus;
  }
}

/** `instanceof` não sobrevive a toda fronteira de módulo/serialização (Inngest
 *  serializa entre steps, e o bundler pode duplicar o módulo entre o build do
 *  server action e o da rota). Checar o `name` é o mesmo critério que o resto
 *  do código já usa pra erro de canal e não depende da identidade da classe. */
export function ehErroSkuSemProduto(error: unknown): error is ErroSkuSemProduto {
  return error instanceof ErroSkuSemProduto
    || (error instanceof Error && error.name === "ErroSkuSemProduto");
}

const PEDIDO_IGNORADO_REGISTRADO = Symbol.for("crm.pedidoIgnoradoRegistrado");

/** Marca o erro original depois que seu payload foi persistido na fila de
 * recuperação. Preservar a instância mantém classificação, mensagem e SKUs
 * para todos os chamadores existentes. */
export function marcarErroComPedidoIgnoradoRegistrado(error: unknown): Error {
  const normalizado = error instanceof Error ? error : new Error(String(error));
  Object.defineProperty(normalizado, PEDIDO_IGNORADO_REGISTRADO, {
    value: true,
    enumerable: false,
    configurable: false,
  });
  return normalizado;
}

export function ehErroComPedidoIgnoradoRegistrado(error: unknown): boolean {
  return error instanceof Error
    && (error as Error & { [PEDIDO_IGNORADO_REGISTRADO]?: boolean })[PEDIDO_IGNORADO_REGISTRADO] === true;
}
