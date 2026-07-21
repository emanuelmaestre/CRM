import { db, type DB } from "@/shared/lib/db";
import { eventoDominio } from "@/shared/lib/db/schema";
import { inngest } from "@/shared/lib/inngest/client";

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

export interface PersistedDomainEvent extends DomainEvent {
  eventId: string;
}

type EventStore = Pick<DB, "insert">;

// Mapa de eventos de domínio (ponto) para eventos Inngest (barra).
// Apenas os eventos que têm jobs Inngest listeners precisam constar aqui.
const INNGEST_EVENT_MAP: Partial<Record<DomainEventType, string>> = {
  "pedido.pago":                      "pedido/pago",
  "pedido.entregue":                  "pedido/entregue",
  "pedido.cancelado":                 "pedido/cancelado",
  "estoque.baixa_automatica":         "estoque/baixa-automatica",
  "cliente.consentimento_revogado":   "cliente/consentimento-revogado",
};

export async function persistirEvento(
  event: DomainEvent,
  store: EventStore = db,
): Promise<PersistedDomainEvent> {
  const [persisted] = await store.insert(eventoDominio).values({
    tipo: event.tipo,
    orgId: event.orgId,
    brandId: event.brandId,
    entidade: event.entidade,
    entidadeId: event.entidadeId,
    causationId: event.causationId,
    payload: event.payload,
  }).returning({ eventId: eventoDominio.id });

  return { ...event, eventId: persisted.eventId };
}

export async function despacharEvento(event: PersistedDomainEvent): Promise<void> {
  const inngestName = INNGEST_EVENT_MAP[event.tipo];
  if (inngestName) {
    await inngest.send({
      name: inngestName,
      data: {
        ...event.payload,
        eventId: event.eventId,
        orgId: event.orgId,
        brandId: event.brandId,
        entityType: event.entidade,
        entityId: event.entidadeId,
        // Compatibilidade durante a migração dos consumidores antigos.
        entidadeId: event.entidadeId,
      },
    });
  }
}

export async function emitirEvento(event: DomainEvent): Promise<void> {
  const persisted = await persistirEvento(event);
  await despacharEvento(persisted);
}
