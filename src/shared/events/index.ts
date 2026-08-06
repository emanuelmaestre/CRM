import { and, asc, eq, inArray } from "drizzle-orm";
import { db, type DB } from "@/shared/lib/db";
import { eventoDominio } from "@/shared/lib/db/schema";
import { inngest } from "@/shared/lib/inngest/client";

export type DomainEventType =
  | "cliente.criado"
  | "cliente.atualizado"
  | "cliente.arquivado"
  | "cliente.mesclado"
  | "cliente.consentimento_registrado"
  | "cliente.consentimento_revogado"
  | "cliente.anotacao_registrada"
  | "cliente.segmento_criado"
  | "cliente.segmento_excluido"
  | "produto.criado"
  | "produto.atualizado"
  | "estoque.movimento_registrado"
  | "usuario.perfil_atualizado"
  | "oportunidade.criada"
  | "oportunidade.movida"
  | "oportunidade.excluida"
  | "tarefa.criada"
  | "tarefa.status_alterado"
  | "agenda.evento_criado"
  | "agenda.evento_excluido"
  | "pedido.recebido"
  | "pedido.pago"
  | "pedido.enviado"
  | "pedido.entregue"
  | "pedido.cancelado"
  | "pedido.devolvido"
  | "estoque.baixa_automatica"
  | "estoque.saldo_atualizado"
  | "estoque.sincronizado"
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
  | "notificacao.interna"
  | "lgpd.anonimizacao_concluida"
  | "backup.executado"
  | "backup.integridade_verificada"
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
  "estoque.saldo_atualizado":         "estoque/saldo.atualizado",
  "produto.atualizado":               "produto/atualizado",
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
      id: event.eventId,
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
    await db
      .update(eventoDominio)
      .set({ processado: "true" })
      .where(and(
        eq(eventoDominio.id, event.eventId),
        eq(eventoDominio.orgId, event.orgId),
      ));
  }
}

/**
 * Recupera eventos persistidos cuja primeira publicação ao Inngest falhou.
 * O eventId é enviado como id do evento, portanto reenvios são deduplicados
 * pelo Inngest e permanecem seguros mesmo com execuções concorrentes.
 */
export async function despacharEventosPendentes(
  orgId: string,
  limit = 100,
): Promise<{ encontrados: number; despachados: number; falhas: number }> {
  const tipos = Object.keys(INNGEST_EVENT_MAP) as DomainEventType[];
  const pendentes = await db
    .select()
    .from(eventoDominio)
    .where(and(
      eq(eventoDominio.orgId, orgId),
      eq(eventoDominio.processado, "false"),
      inArray(eventoDominio.tipo, tipos),
    ))
    .orderBy(asc(eventoDominio.createdAt))
    .limit(limit);

  let despachados = 0;
  let falhas = 0;
  for (const pendente of pendentes) {
    try {
      await despacharEvento({
        eventId: pendente.id,
        tipo: pendente.tipo as DomainEventType,
        orgId: pendente.orgId,
        brandId: pendente.brandId ?? undefined,
        entidade: pendente.entidade,
        entidadeId: pendente.entidadeId,
        causationId: pendente.causationId ?? undefined,
        payload: pendente.payload as Record<string, unknown>,
      });
      despachados++;
    } catch {
      falhas++;
    }
  }

  return { encontrados: pendentes.length, despachados, falhas };
}

export async function emitirEvento(event: DomainEvent): Promise<void> {
  const persisted = await persistirEvento(event);
  await despacharEvento(persisted);
}
