import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db, type DB } from "@/shared/lib/db";
import { eventoDominio } from "@/shared/lib/db/schema";
import { inngest } from "@/shared/lib/inngest/client";
import { notificarAdminWhatsApp } from "@/shared/lib/whatsapp/notificacoes-admin";

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
  | "produto.desativado_automaticamente"
  | "usuario.criado"
  | "usuario.perfil_atualizado"
  | "usuario.senha_redefinida"
  | "oportunidade.criada"
  | "oportunidade.movida"
  | "oportunidade.excluida"
  | "pedido.recebido"
  | "pedido.pago"
  | "pedido.enviado"
  | "pedido.entregue"
  | "pedido.cancelado"
  | "pedido.devolvido"
  | "estoque.sincronizado"
  | "estoque.minimo_atingido"
  | "estoque.parado_detectado"
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
    // "processado" significa "não há mais nada a fazer com este evento", não
    // "existe um job que o consumiu". Evento sem entrada no INNGEST_EVENT_MAP
    // nunca vai ser despachado, então nascer como pendente só engordava a fila
    // que despacharEventosPendentes varre a cada 4 minutos: em 20/08 eram ~54
    // mil linhas presas assim. A linha continua gravada para auditoria.
    processado: INNGEST_EVENT_MAP[event.tipo] ? "false" : "true",
  }).returning({ eventId: eventoDominio.id });

  return { ...event, eventId: persisted.eventId };
}

export async function despacharEvento(event: PersistedDomainEvent): Promise<void> {
  // Independente do Inngest: aviso de WhatsApp para o admin nunca pode
  // bloquear nem ser bloqueado pelo restante do despacho.
  void notificarAdminWhatsApp(event);

  const inngestName = INNGEST_EVENT_MAP[event.tipo];
  if (!inngestName) return;

  try {
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
  } catch (error) {
    // O evento já está persistido por persistirEvento e fica com processado="false";
    // despacharEventosPendentes reenvia depois. Uma falha aqui (Inngest fora do ar,
    // sem credencial no ambiente) não pode derrubar a operação de negócio que já
    // foi concluída — o Inngest deduplica por eventId, então um reenvio é seguro
    // mesmo se o send tiver ido adiante antes de o erro acontecer.
    console.error(`[despacharEvento] falha ao publicar ${event.tipo} (${event.eventId}):`, error);
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

/**
 * Emite o evento apenas se o mesmo tipo ainda não tiver sido registrado para a
 * mesma entidade dentro da janela.
 *
 * Serve para alarme de falha que se repete no ritmo do cron: um canal fora do
 * ar fazia o A24 gravar `canal.degradado` a cada 4 minutos e disparar um aviso
 * de WhatsApp para o admin junto — 12.815 linhas acumuladas até 20/08 para uma
 * informação que só muda quando o canal volta. A janela é verificada no banco,
 * não em memória, porque cada execução serverless começa do zero e porque uma
 * nova tentativa do Inngest reexecuta o mesmo trecho.
 *
 * Retorna true quando o evento foi realmente emitido.
 */
export async function emitirEventoUnico(
  event: DomainEvent,
  janelaMinutos = 60,
): Promise<boolean> {
  const desde = new Date(Date.now() - janelaMinutos * 60 * 1_000);
  const chave = `${event.orgId}:${event.tipo}:${event.entidadeId}`;

  // A consulta e a inserção precisam formar uma única seção crítica. Sem o
  // advisory lock, duas invocações serverless podem consultar ao mesmo tempo,
  // ambas não encontrar o evento e gravar/enviar a mesma notificação. O lock
  // é por chave, portanto contas ou tipos diferentes continuam em paralelo.
  const persisted = await db.transaction(async (tx) => {
    await tx.execute(sql`
      select pg_advisory_xact_lock(hashtextextended(${chave}, 0))
    `);

    const [jaRegistrado] = await tx
      .select({ id: eventoDominio.id })
      .from(eventoDominio)
      .where(and(
        eq(eventoDominio.orgId, event.orgId),
        eq(eventoDominio.tipo, event.tipo),
        eq(eventoDominio.entidadeId, event.entidadeId),
        gte(eventoDominio.createdAt, desde),
      ))
      .orderBy(desc(eventoDominio.createdAt))
      .limit(1);

    if (jaRegistrado) return null;
    return persistirEvento(event, tx);
  });

  if (!persisted) return false;

  // Chamadas de rede ficam fora da transação para liberar imediatamente o
  // advisory lock e a única conexão do pool desta instância.
  await despacharEvento(persisted);
  return true;
}
