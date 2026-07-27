-- Fase C: historico de scores (serie temporal) para conferencia contra historico real.
-- Rollback:
--   DROP POLICY IF EXISTS rls_score_historico ON public.score_historico;
--   DROP TABLE IF EXISTS public.score_historico;

CREATE TABLE IF NOT EXISTS public.score_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.org(id),
  tipo text NOT NULL,
  entidade_id uuid NOT NULL,
  valor_principal integer NOT NULL,
  snapshot jsonb NOT NULL,
  versao_formula text NOT NULL,
  calculado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_score_historico_org ON public.score_historico(org_id);
CREATE INDEX IF NOT EXISTS idx_score_historico_entidade ON public.score_historico(tipo, entidade_id, calculado_em);

ALTER TABLE public.score_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.score_historico FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_score_historico ON public.score_historico;
CREATE POLICY rls_score_historico ON public.score_historico
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);
