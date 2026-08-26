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
  itens: {
    skuExterno: string;
    quantidade: number;
    precoUnitario: string;
    /** Comissão que o canal cobrou por este item. No Mercado Livre vem de
     *  `sale_fee`; na Shopee, as tarifas do escrow são rateadas entre os itens
     *  preservando o total exato cobrado no pedido. */
    taxaMarketplace?: string;
  }[];
  criadoEm: Date;
}

export interface SaudeConector {
  status: "ok" | "degradado" | "erro";
  latenciaMs?: number;
  mensagem?: string;
  verificadoEm: Date;
}

export interface ChannelProvider {
  buscarPedidos(desde: Date): Promise<PedidoNormalizado[]>;
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
