-- Fase B: evidência objetiva do SLA de ingestão e recuperação do outbox.
-- Rollback:
--   DROP INDEX IF EXISTS public.idx_evento_dominio_pendente;
--   DROP INDEX IF EXISTS public.idx_pedido_recebido;
--   ALTER TABLE public.pedido DROP COLUMN IF EXISTS recebido_em;

ALTER TABLE public.pedido
  ADD COLUMN IF NOT EXISTS recebido_em timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_pedido_recebido
  ON public.pedido(recebido_em);

CREATE INDEX IF NOT EXISTS idx_evento_dominio_pendente
  ON public.evento_dominio(org_id, criado_em)
  WHERE processado = 'false'
    AND tipo IN (
      'pedido.pago',
      'pedido.entregue',
      'pedido.cancelado',
      'estoque.baixa_automatica',
      'estoque.saldo_atualizado',
      'cliente.consentimento_revogado'
    );
