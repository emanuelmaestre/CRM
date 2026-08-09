-- estoque_divergencia (migracao 0020) nunca recebeu RLS: a tabela e
-- multi-tenant (org_id) mas ficava acessivel entre organizacoes para
-- qualquer client autenticado direto no Postgres. Mesmo padrao das
-- tabelas org-scoped mais recentes (ver 0019_historical_marketplace_import):
-- isolamento por org_id + restricao de perfil, espelhando o
-- assertPerfil(ctx, ["admin", "gestor"]) ja aplicado em
-- src/modules/estoque/application/estoque.service.ts.

ALTER TABLE public.estoque_divergencia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estoque_divergencia FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_estoque_divergencia ON public.estoque_divergencia
  FOR ALL TO PUBLIC
  USING (org_id = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.current_org_id', true), '')::uuid);

CREATE POLICY rls_profile_manager_estoque_divergencia ON public.estoque_divergencia
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.current_app_profile() IN ('admin', 'gestor'))
  WITH CHECK (public.current_app_profile() IN ('admin', 'gestor'));
