import { enviarTextoZApi, zapiConfigurado } from "./zapi-client";
import type { DomainEventType, PersistedDomainEvent } from "@/shared/events";

/**
 * Lista curada de eventos que viram aviso de WhatsApp para o responsável
 * que administra o CRM. Cobre hoje: Estoque, Atendimento, Vendas/Pós-venda
 * e Operacional/Conectores. IA (insight/sugestão) fica fora de propósito —
 * são leituras, não avisos acionáveis.
 *
 * `score.churn_alterado` fica fora daqui apesar de existir: sem o nome do
 * cliente no payload hoje, a mensagem ficaria genérica demais para agir.
 * Reclamações do ML e cancelamento/devolução ainda não emitem evento de
 * domínio — precisam de job novo antes de entrar nesta lista.
 */
const FORMATADORES: Partial<Record<DomainEventType, (event: PersistedDomainEvent) => string>> = {
  "estoque.minimo_atingido": (e) => {
    const { sku, saldoAtual, minimo } = e.payload as { sku?: string; saldoAtual?: number; minimo?: number };
    return `📦 Estoque mínimo atingido\nSKU: ${sku ?? "?"}\nSaldo atual: ${saldoAtual ?? "?"} (mínimo: ${minimo ?? "?"})`;
  },
  "estoque.parado_detectado": (e) => {
    const { sku, diasSemVenda, capitalParado } = e.payload as { sku?: string; diasSemVenda?: number; capitalParado?: number };
    return `🐌 Produto parado\nSKU: ${sku ?? "?"}\nSem venda há ${diasSemVenda ?? "?"} dias\nCapital parado: R$ ${capitalParado ?? "?"}`;
  },
  "conversa.sem_resposta_24h": (e) => {
    return `💬 Conversa sem resposta há mais de 24h\nConversa: ${e.entidadeId}`;
  },
  "canal.degradado": (e) => {
    const { ultimoErro } = e.payload as { ultimoErro?: string };
    return `⚠️ Canal degradado\nConta: ${e.entidadeId}${e.brandId ? `\nMarca: ${e.brandId}` : ""}\nErro: ${ultimoErro ?? "não informado"}`;
  },
  "canal.desconectado": (e) => {
    const { ultimoErro } = e.payload as { ultimoErro?: string };
    return `🔴 Canal desconectado\nConta: ${e.entidadeId}${e.brandId ? `\nMarca: ${e.brandId}` : ""}\nErro: ${ultimoErro ?? "não informado"}`;
  },
  "backup.falhou": (e) => {
    const { detalhe } = e.payload as { detalhe?: string };
    return `🚨 Verificação de backup falhou\n${detalhe ?? ""}`;
  },
};

export function whatsappAlertaConfigurado(): boolean {
  return process.env.WHATSAPP_ADMIN_ALERTAS_ENABLED === "true"
    && zapiConfigurado()
    && Boolean(process.env.WHATSAPP_ADMIN_NUMERO);
}

/**
 * Ponto único de saída para avisos de WhatsApp. Chamado pelo despachante
 * central de eventos (despacharEvento) — nunca deve lançar, uma falha aqui
 * não pode derrubar a operação de negócio que gerou o evento.
 */
export async function notificarAdminWhatsApp(event: PersistedDomainEvent): Promise<void> {
  if (!whatsappAlertaConfigurado()) return;

  const formatar = FORMATADORES[event.tipo];
  if (!formatar) return;

  try {
    await enviarTextoZApi({
      numero: process.env.WHATSAPP_ADMIN_NUMERO!,
      mensagem: formatar(event),
    });
  } catch (error) {
    console.error(`[notificarAdminWhatsApp] falha ao enviar aviso para ${event.tipo} (${event.eventId}):`, error);
  }
}
