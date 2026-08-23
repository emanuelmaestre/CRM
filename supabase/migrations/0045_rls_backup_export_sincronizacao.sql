-- backup_export (0036) e sincronizacao_execucao (0030) sao multi-tenant
-- (org_id) mas ficaram sem RLS desde a criacao -- mesma classe de achado do
-- pentest de compliance ML de 17/08/2026 que ja motivou a 0037_rls_anuncios,
-- so que so apareceu agora porque o CI nao rodava as migrations ate o fim
-- num banco limpo (bug de migrations duplicadas na 0030, ja corrigido).
--
-- backup_export so e acessado por assertPerfil(ctx, ["admin"]) em
-- backups.service.ts; sincronizacao_execucao por assertPerfil(ctx, ["admin",
-- "gestor"]) em sincronizacao.service.ts -- as policies de perfil abaixo
-- espelham isso.

ALTER TABLE public.backup_export ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_export FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_backup_export ON public.backup_export
  FOR ALL TO authenticated
  USING (org_id = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.current_org_id', true), '')::uuid);

CREATE POLICY rls_profile_manager_backup_export ON public.backup_export
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.current_app_profile() IN ('admin'))
  WITH CHECK (public.current_app_profile() IN ('admin'));

ALTER TABLE public.sincronizacao_execucao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sincronizacao_execucao FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_sincronizacao_execucao ON public.sincronizacao_execucao
  FOR ALL TO authenticated
  USING (org_id = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.current_org_id', true), '')::uuid);

CREATE POLICY rls_profile_manager_sincronizacao_execucao ON public.sincronizacao_execucao
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.current_app_profile() IN ('admin', 'gestor'))
  WITH CHECK (public.current_app_profile() IN ('admin', 'gestor'));
