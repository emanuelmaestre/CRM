/** Quanto uma chamada pelo proxy custa além do que o corpo mostra.
 *
 *  A Webshare cobra bytes de fio: linha de requisição, cabeçalhos de ida
 *  (autenticação, assinatura), cabeçalhos de volta e o handshake amortizado
 *  do túnel. Nada disso aparece no corpo medido em `shopeeFetch`, e medir só
 *  o corpo subestimava o consumo real — orçamento que subestima é orçamento
 *  que estoura sem avisar.
 *
 *  Mora sozinho aqui porque DOIS lados precisam concordar sobre o mesmo
 *  número: o freio preventivo dentro do proxy e o painel de Uso da API em
 *  Configurações. Se cada um somasse do seu jeito, a tela mostraria 700 MB
 *  enquanto o freio já teria cortado as coletas secundárias — o operador
 *  vendo folga onde não há.
 *
 *  A conta oficial continua sendo o painel da Webshare; esta é a nossa
 *  estimativa, deliberadamente conservadora. */
export const OVERHEAD_POR_CHAMADA_BYTES = 900;

/** Franquia mensal do plano gratuito da Webshare. */
export const FRANQUIA_MENSAL_BYTES = 1024 ** 3;

/** A partir deste consumo o proxy preserva autenticação e pedidos e adia as
 *  coletas secundárias (catálogo, avaliações, anúncios, reputação). */
export const LIMITE_PRIORIZACAO_BYTES = 800 * 1024 * 1024;
