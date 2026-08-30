/** Endereço de entrega do pedido. Opcional e por enquanto só o Mercado Livre
 *  preenche (ver mercadolivre.provider.ts) — Shopee/TikTok continuam mandando
 *  só o que já mandavam, sem quebrar nada. */
export interface EnderecoEntregaNormalizado {
  nomeDestinatario?: string;
  rua?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  latitude?: number;
  longitude?: number;
}

export interface PedidoNormalizado {
  providerOrderId: string;
  canal: string;
  clienteExternalId: string;
  clienteNome: string;
  clienteEmail?: string;
  clienteTelefone?: string;
  clienteEndereco?: EnderecoEntregaNormalizado;
  status: string;
  total: string;
  frete?: string;
  /** Desconto/cupom aplicado ao pedido, quando o canal informa. Na Shopee,
   *  soma vouchers e moedas do checkout vindos do demonstrativo financeiro. */
  desconto?: string;
  /** Valor a mais que o comprador pagou além do total nominal (ex.: juro de
   *  parcelamento), quando o canal informa. */
  acrescimo?: string;
  /** Repasse líquido calculado pelo próprio canal. Na Shopee é o
   * `escrow_amount`, que inclui tarifas, subsídios e ajustes que não podem ser
   * reconstruídos com exatidão apenas a partir do total do comprador. */
  valorLiquido?: string;
  dadosOrigem?: Record<string, unknown>;
  atualizadoOrigemEm?: Date;
  itens: {
    skuExterno: string;
    quantidade: number;
    precoUnitario: string;
    /** Comissão total da linha. No Mercado Livre é `sale_fee * quantidade`;
     *  na Shopee, as tarifas do escrow são rateadas entre os itens
     *  preservando o total exato cobrado no pedido. */
    taxaMarketplace?: string;
    /* ── O anúncio de onde a venda saiu ──────────────────────────────────
     *
     *  O pedido guarda o SKU congelado no momento da compra, e a importação
     *  de catálogo só enxerga anúncio à venda. Das duas coisas juntas nasce o
     *  pedido que nunca entra: anúncio pausado (produto nunca criado) ou SKU
     *  renomeado depois da venda (produto existe, com outro nome). Foram 40
     *  pedidos da WUWU, R$ 1.344,20, achados em 29/08/2026.
     *
     *  Levar o anúncio junto resolve os dois: a ingestão casa pelo vínculo do
     *  anúncio quando o SKU não bate e, se nem o anúncio for conhecido, cria
     *  o produto com o que o próprio pedido informa. Opcionais porque canal
     *  que não souber preencher continua caindo no fluxo antigo. */
    listingId?: string;
    variationId?: string | null;
    titulo?: string;
  }[];
  criadoEm: Date;
}

export interface SaudeConector {
  status: "ok" | "degradado" | "erro";
  latenciaMs?: number;
  mensagem?: string;
  verificadoEm: Date;
}

/** Quem chama decide, olhando o banco, o que da janela ainda precisa ser
 *  lido por inteiro. Ver `filtrarPedidosPendentes`. */
export interface OpcoesBuscaPedidos {
  campoData?: "criacao" | "atualizacao";
  ate?: Date;
  filtrarPendentes?: (
    candidatos: ReadonlyArray<{ providerOrderId: string; statusExterno: string }>,
  ) => Promise<string[]>;
}

export interface ChannelProvider {
  buscarPedidos(desde: Date, opcoes?: OpcoesBuscaPedidos): Promise<PedidoNormalizado[]>;
  /** Fatia o intervalo em pedaços que cabem num `step.run` do Inngest.
   *
   *  Quem implementa o par `janelasDePedidos`/`buscarPedidosDaJanela` permite
   *  que a sincronização manual (A31) busque UMA janela por step, em vez dos
   *  90 dias inteiros dentro de um step só — que estoura o `maxDuration`,
   *  faz o Inngest reexecutar do zero e prende a execução em `em_andamento`
   *  para sempre. Quem não implementa cai no `buscarPedidos` inteiro, que é o
   *  suficiente para canal de volume baixo. */
  janelasDePedidos?(desde: Date, ate?: Date): Array<{ inicioMs: number; fimMs: number }>;
  /** Uma janela de `janelasDePedidos` — as duas andam juntas.
   *
   *  `filtrarPendentes` deixa quem chama decidir, olhando o banco, quais
   *  pedidos da janela ainda valem uma leitura de detalhe. Existe porque a
   *  janela de contingência revisita as mesmas horas várias vezes por dia: sem
   *  o filtro, todo pedido já importado e já liquidado era relido inteiro —
   *  detalhe e repasse — a cada passagem, gastando cota do proxy para
   *  reescrever exatamente o que já estava gravado. Provider que não recebe o
   *  filtro continua lendo tudo, que é o comportamento antigo. */
  buscarPedidosDaJanela?(
    inicioMs: number,
    fimMs: number,
    opcoes?: OpcoesBuscaPedidos,
  ): Promise<PedidoNormalizado[]>;
  sincronizarEstoque(referencia: EstoqueCanalRef, saldo: number): Promise<void>;
  consultarEstoque(referencia: EstoqueCanalRef): Promise<number>;
  saude(): Promise<SaudeConector>;
  /** Status real do anúncio (active/paused/closed). Só o Mercado Livre expõe
   *  isso hoje. Usado pelo A5
   *  pra desativar produtos cujo anúncio some do canal, sem depender só do
   *  saldo (que fica congelado, não "avisa" que o anúncio acabou). */
  consultarStatusAnuncio?(referencia: EstoqueCanalRef): Promise<{ status: string; subStatus: string[] } | null>;
}

export interface EstoqueCanalRef {
  listingId: string;
  skuId?: string | null;
  warehouseId?: string | null;
}

export interface MensagemPayload {
  para: string;
  conteudo: string;
  tipo?: "texto" | "imagem" | "audio" | "documento";
  mediaUrl?: string;
}

export interface MensagemRecebida {
  providerMessageId: string;
  de: string;
  conteudo: string;
  tipo: string;
  recebidaEm: Date;
  meta?: Record<string, unknown>;
}

export interface MessagingProvider {
  enviarMensagem(payload: MensagemPayload): Promise<{ providerMessageId: string }>;
  saude(): Promise<SaudeConector>;
}

export interface BillingProvider {
  criarCobranca(dados: { clienteId: string; valor: string; descricao: string }): Promise<{ cobrancaId: string; linkPagamento: string }>;
  saude(): Promise<SaudeConector>;
}
