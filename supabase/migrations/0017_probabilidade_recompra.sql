-- Item 05 (IA preditiva): probabilidade explicita de recompra em 30 dias,
-- alem da estimativa de dias ja existente (proxima_compra_estimada).
-- Rollback:
--   ALTER TABLE public.score_cliente DROP COLUMN IF EXISTS probabilidade_recompra_30d;

ALTER TABLE public.score_cliente ADD COLUMN IF NOT EXISTS probabilidade_recompra_30d integer;
