-- conferencia_financeira (0061) e multi-tenant (org_id) e nasce com RLS, na
-- mesma linha da 0045_rls_backup_export_sincronizacao: toda tabela nova com
-- org_id entra com a policy de tenant mais a policy RESTRICTIVE de perfil que
-- espelha o assertPerfil do servico.
--
-- O ledger da conferencia financeira so e lido por assertPerfil(ctx,
-- ["admin", "gestor"]) em conferencia-financeira.service.ts; o job A35 escreve
-- com a role de servico (bypassa RLS como os demais jobs). As policies abaixo
-- valem para o acesso via aplicacao.

ALTER TABLE public.conferencia_financeira ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conferencia_financeira FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_conferencia_financeira ON public.conferencia_financeira
  FOR ALL TO authenticated
  USING (org_id = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.current_org_id', true), '')::uuid);

CREATE POLICY rls_profile_manager_conferencia_financeira ON public.conferencia_financeira
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.current_app_profile() IN ('admin', 'gestor'))
  WITH CHECK (public.current_app_profile() IN ('admin', 'gestor'));
