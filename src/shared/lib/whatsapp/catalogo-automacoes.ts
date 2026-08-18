import type { DomainEventType } from "@/shared/events";

/** Catálogo estático (sem env, sem segredo) das automações que viram aviso
 *  de WhatsApp para o admin. Existe separado de notificacoes-admin.ts para
 *  poder ser importado por componentes de cliente sem arrastar a chamada à
 *  Z-API — só o rótulo e o tom de cada uma. */
export interface AutomacaoWhatsApp {
  chave: DomainEventType;
  categoria: "Estoque" | "Atendimento" | "Vendas & pós-venda" | "Relacionamento" | "Operacional";
  emoji: string;
  titulo: string;
  tom: string;
  /** Mesmo texto que enviarTextoZApi manda pro WhatsApp — só com os valores
   *  reais trocados por {placeholder}. Fica aqui, e não derivado dos
   *  formatadores de notificacoes-admin.ts, porque aquele arquivo recebe um
   *  PersistedDomainEvent de verdade (id, orgId, payload) pra formatar; não
   *  dá pra chamá-lo sem um evento real só pra mostrar o modelo na tela. */
  modelo: string;
}

export const CATALOGO_AUTOMACOES_WHATSAPP: AutomacaoWhatsApp[] = [
  {
    chave: "estoque.minimo_atingido",
    categoria: "Estoque",
    emoji: "📦",
    titulo: "Estoque baixo",
    tom: "Assim que um produto bate no mínimo, a gente te chama no zap antes que falte de verdade.",
    modelo: "📦 *Estoque mínimo atingido*\nEmpresa: {empresa}\nProduto: {produtoNome} (SKU {sku})\nSaldo atual: {saldoAtual} · mínimo configurado: {minimo}\nVale repor antes que o anúncio fique sem estoque em algum canal.",
  },
  {
    chave: "estoque.parado_detectado",
    categoria: "Estoque",
    emoji: "🐌",
    titulo: "Produto parado",
    tom: "Item parado há tempo demais? Avisamos pra você decidir: promoção, ajuste ou deixa quieto.",
    modelo: "🐌 *Produto parado*\nEmpresa: {empresa}\nProduto: {produtoNome} (SKU {sku})\nSem venda há {diasSemVenda} dias · capital parado: R$ {capitalParado}\nPode ser hora de promoção, ajuste de preço ou revisão do anúncio.",
  },
  {
    chave: "conversa.sem_resposta_24h",
    categoria: "Atendimento",
    emoji: "💬",
    titulo: "Cliente esperando",
    tom: "Ninguém fica 24h sem resposta sem você saber — a gente cutuca no WhatsApp.",
    modelo: "💬 *Cliente esperando resposta*\nEmpresa: {empresa}\nCanal: {canal}\nConversa aberta há mais de 24h sem retorno da equipe.",
  },
  {
    chave: "pedido.cancelado",
    categoria: "Vendas & pós-venda",
    emoji: "❌",
    titulo: "Pedido cancelado",
    tom: "Cancelamento a gente avisa na hora, já com valor e motivo — pra você saber o tamanho do estrago sem abrir o sistema.",
    modelo: "❌ *Pedido cancelado*\nEmpresa: {empresa}\nCanal: {canal}\nPedido: {providerOrderId} · valor: R$ {total}\nMotivo: {canceladoMotivo}",
  },
  {
    chave: "pedido.devolvido",
    categoria: "Vendas & pós-venda",
    emoji: "↩️",
    titulo: "Pedido devolvido",
    tom: "Devolução também cai no zap, na mesma hora que acontece.",
    modelo: "↩️ *Pedido devolvido*\nEmpresa: {empresa}\nCanal: {canal}\nPedido: {providerOrderId} · valor: R$ {total}",
  },
  {
    chave: "regua.falha_definitiva",
    categoria: "Relacionamento",
    emoji: "🛑",
    titulo: "Régua travou de vez",
    tom: "Quando uma régua desiste de tentar de novo (não é falha passageira), a gente conta pra você decidir o próximo passo com o cliente.",
    modelo: "🛑 *Régua travou de vez*\nEmpresa: {empresa}\nMotivo: {motivo}\nEssa régua não vai tentar de novo sozinha — vale olhar o cliente manualmente.",
  },
  {
    chave: "importacao.com_erros",
    categoria: "Operacional",
    emoji: "📥",
    titulo: "Importação com erros",
    tom: "Terminou de importar, mas nem tudo entrou limpo — te mandamos o placar pra você conferir o que ficou de fora.",
    modelo: "📥 *Importação concluída com erros*\nAceitos: {aceitos} de {total}\nRejeitados: {rejeitados}\nVale abrir o lote e ver o que não entrou.",
  },
  {
    chave: "canal.degradado",
    categoria: "Operacional",
    emoji: "⚠️",
    titulo: "Canal com problema",
    tom: "Se uma conta começar a engasgar, você é o primeiro a saber — não o cliente.",
    modelo: "⚠️ *Canal degradado*\nEmpresa: {empresa}\nCanal: {canal}\nErro reportado: {ultimoErro}",
  },
  {
    chave: "canal.desconectado",
    categoria: "Operacional",
    emoji: "🔴",
    titulo: "Canal caiu",
    tom: "Token expirou, conta caiu: mandamos o alerta na hora, sem esperar você notar sozinho.",
    modelo: "🔴 *Canal desconectado*\nEmpresa: {empresa}\nCanal: {canal}\nMotivo: {ultimoErro}\nReconecte em Configurações → Canais assim que possível.",
  },
  {
    chave: "backup.falhou",
    categoria: "Operacional",
    emoji: "🚨",
    titulo: "Backup falhou",
    tom: "Esse aqui é sério: se o backup falhar, o aviso chega na hora, não no fim do mês.",
    modelo: "🚨 *Verificação de backup falhou*\nAbrangência: toda a organização (este item não é por empresa/canal).\nDetalhe: {detalhe}",
  },
];

export const CATEGORIAS_AUTOMACOES_WHATSAPP = [
  "Estoque",
  "Atendimento",
  "Vendas & pós-venda",
  "Relacionamento",
  "Operacional",
] as const;

// Cor de identidade por categoria — compartilhada entre o card Automações e
// o sino de notificações, pra não desenhar a mesma coisa duas vezes com
// paletas diferentes.
export const CATEGORIA_COR_AUTOMACAO: Record<AutomacaoWhatsApp["categoria"], string> = {
  "Estoque": "var(--acento-2)",
  "Atendimento": "var(--info)",
  "Vendas & pós-venda": "var(--acento-3)",
  "Relacionamento": "var(--acento-1)",
  "Operacional": "var(--warning)",
};

/** Busca rápida por chave de evento — usado pelo sino, que recebe só o
 *  `tipo` bruto do evento de domínio e precisa do emoji/título/categoria. */
export function automacaoPorChave(chave: string): AutomacaoWhatsApp | undefined {
  return CATALOGO_AUTOMACOES_WHATSAPP.find((item) => item.chave === chave);
}
