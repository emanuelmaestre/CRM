export interface PedidoNormalizado {
  providerOrderId: string;
  canal: string;
  clienteExternalId: string;
  clienteNome: string;
  clienteEmail?: string;
  clienteTelefone?: string;
  status: string;
  total: string;
  frete?: string;
  itens: { skuExterno: string; quantidade: number; precoUnitario: string }[];
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
