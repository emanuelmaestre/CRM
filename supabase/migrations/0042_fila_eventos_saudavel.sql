-- Fila de eventos: parar de acumular pendência que ninguém consome.
--
-- Diagnóstico (20/08): evento_dominio tem 55.587 linhas, 54.032 ainda com
-- processado='false'. Não é backlog de verdade — são tipos sem consumidor no
-- Inngest (estoque.divergencia_detectada 36.727, canal.degradado 12.815,
-- conversa.sem_resposta_24h 1.270), que persistem mas nunca são marcados.
-- A varredura da fila (despacharEventosPendentes) já consumiu ~292s
-- acumulados porque o índice parcial de 0013 lista tipos que o código não
-- consulta mais, obrigando o Postgres a cair no idx_evento_tipo, filtrar e
-- ordenar.
--
-- A ordem das operações abaixo não é arbitrária:
--   drop antes do update  → `processado` deixa de participar de qualquer
--                           índice, então o UPDATE de 54 mil linhas vira HOT
--                           e não reescreve os 5 índices da tabela;
--   create depois         → o índice parcial nasce indexando as poucas linhas
--                           realmente pendentes, não as 54 mil de antes.
--
-- Rollback:
--   DROP INDEX IF EXISTS public.idx_evento_dominio_fila;
--   (o UPDATE de backfill não tem rollback útil: os eventos afetados não têm
--    consumidor, então marcá-los de volta como pendentes só recria o problema)

-- 1) Sai o índice de 0013. Ele congelou os tipos de então
--    ('estoque.baixa_automatica', 'estoque.saldo_atualizado') e deixou de
--    casar com a consulta assim que o mapa de eventos mudou.
DROP INDEX IF EXISTS public.idx_evento_dominio_pendente;
--> statement-breakpoint
-- 2) Backfill: tudo que não tem consumidor no INNGEST_EVENT_MAP passa a contar
--    como já processado. A linha continua na tabela para auditoria.
UPDATE public.evento_dominio
   SET processado = 'true'
 WHERE processado = 'false'
   AND tipo NOT IN (
     'pedido.pago',
     'pedido.entregue',
     'pedido.cancelado',
     'produto.atualizado',
     'cliente.consentimento_revogado'
   );
--> statement-breakpoint
-- 3) Índice da fila sem lista de tipos embutida: qualquer alteração futura no
--    INNGEST_EVENT_MAP continua usando o índice, sem precisar de migração.
CREATE INDEX IF NOT EXISTS idx_evento_dominio_fila
  ON public.evento_dominio(org_id, criado_em)
  WHERE processado = 'false';
--> statement-breakpoint
-- 4) O UPDATE mudou a seletividade de `processado` por completo. Sem estatística
--    nova o planejador continua estimando 97% das linhas como pendentes.
ANALYZE public.evento_dominio;
