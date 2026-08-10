-- ml_avaliacao_anuncio (migracao 0022) e multi-tenant (org_id): mesmo padrao
-- de isolamento por org_id ja aplicado em channel_account/conversa.

ALTER TABLE public.ml_avaliacao_anuncio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ml_avaliacao_anuncio FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_ml_avaliacao_anuncio ON public.ml_avaliacao_anuncio
  FOR ALL TO authenticated
  USING (org_id = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.current_org_id', true), '')::uuid);
