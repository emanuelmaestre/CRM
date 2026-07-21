import { db } from "@/shared/lib/db";
import { eventoDominio } from "@/shared/lib/db/schema";

export type DomainEventType =
  | "cliente.criado"
  | "cliente.mesclado"
  | "cliente.consentimento_registrado"
  | "cliente.consentimento_revogado"
  | "pedido.recebido"
  | "pedido.pago"
  | "pedido.enviado"
  | "pedido.entregue"
  | "pedido.cancelado"
  | "pedido.devolvido"
  | "estoque.baixa_automatica"
  | "estoque.minimo_atingido"
  | "estoque.parado_detectado"
  | "estoque.divergencia_detectada"
  | "conversa.recebida"
  | "conversa.sem_resposta_24h"
  | "mensagem.falhou"
  | "regua.disparada"
  | "regua.bloqueada"
  | "regua.falha_definitiva"
  | "score.churn_alterado"
  | "score.encalhe_alterado"
  | "ia.insight_gerado"
  | "ia.sugestao_criada"
  | "ia.sugestao_aprovada"
  | "ia.sugestao_rejeitada"
  | "ia.limite_consumo_atingido"
  | "documento.gerado"
  | "canal.conectado"
  | "canal.degradado"
  | "canal.desconectado"
  | "importacao.concluida"
  | "importacao.com_erros"
  | "backup.executado"
  | "backup.falhou";

export interface DomainEvent {
  tipo: DomainEventType;
  orgId: string;
  brandId?: string;
  entidade: string;
  entidadeId: string;
  causationId?: string;
  payload: Record<string, unknown>;
}

export async function emitirEvento(event: DomainEvent): Promise<void> {
  await db.insert(eventoDominio).values({
    tipo: event.tipo,
    orgId: event.orgId,
    brandId: event.brandId,
    entidade: event.entidade,
    entidadeId: event.entidadeId,
    causationId: event.causationId,
    payload: event.payload,
  });
}
