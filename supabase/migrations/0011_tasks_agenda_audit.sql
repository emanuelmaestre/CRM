-- Integridade e RLS da operação comercial: tarefas, agenda e auditoria.

CREATE INDEX IF NOT EXISTS idx_tarefa_status ON public.tarefa (status);
CREATE INDEX IF NOT EXISTS idx_evento_agenda_responsavel ON public.evento_agenda (responsavel_id);
CREATE INDEX IF NOT EXISTS idx_audit_autor ON public.audit_log (autor_id);
CREATE INDEX IF NOT EXISTS idx_audit_acao ON public.audit_log (acao);

ALTER TABLE public.tarefa
  ADD CONSTRAINT chk_tarefa_titulo_preenchido CHECK (btrim(titulo) <> '');
ALTER TABLE public.evento_agenda
  ADD CONSTRAINT chk_evento_agenda_titulo_preenchido CHECK (btrim(titulo) <> '');
ALTER TABLE public.evento_agenda
  ADD CONSTRAINT chk_evento_agenda_periodo CHECK (fim IS NULL OR fim > inicio);

-- A organização passa a fazer parte da referência, bloqueando vínculos
-- cruzados mesmo para rotinas internas que operam fora da RLS.
ALTER TABLE public.tarefa
  ADD CONSTRAINT fk_tarefa_cliente_org FOREIGN KEY (cliente_id, org_id)
  REFERENCES public.cliente (id, org_id);
ALTER TABLE public.tarefa
  ADD CONSTRAINT fk_tarefa_responsavel_org FOREIGN KEY (responsavel_id, org_id)
  REFERENCES public.app_user (id, org_id);
ALTER TABLE public.evento_agenda
  ADD CONSTRAINT fk_evento_agenda_cliente_org FOREIGN KEY (cliente_id, org_id)
  REFERENCES public.cliente (id, org_id);
ALTER TABLE public.evento_agenda
  ADD CONSTRAINT fk_evento_agenda_responsavel_org FOREIGN KEY (responsavel_id, org_id)
  REFERENCES public.app_user (id, org_id);
ALTER TABLE public.audit_log
  ADD CONSTRAINT fk_audit_brand_org FOREIGN KEY (brand_id, org_id)
  REFERENCES public.brand (id, org_id);
ALTER TABLE public.audit_log
  ADD CONSTRAINT fk_audit_autor_org FOREIGN KEY (autor_id, org_id)
  REFERENCES public.app_user (id, org_id);

-- Vendedor acessa somente sua própria operação; gestor/admin enxergam
-- e administram toda a equipe do tenant.
CREATE POLICY rls_profile_owner_tarefa ON public.tarefa
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    public.current_app_profile() IN ('admin', 'gestor')
    OR responsavel_id = public.current_app_user_id()
  )
  WITH CHECK (
    public.current_app_profile() IN ('admin', 'gestor')
    OR responsavel_id = public.current_app_user_id()
  );

CREATE POLICY rls_profile_owner_evento_agenda ON public.evento_agenda
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    public.current_app_profile() IN ('admin', 'gestor')
    OR responsavel_id = public.current_app_user_id()
  )
  WITH CHECK (
    public.current_app_profile() IN ('admin', 'gestor')
    OR responsavel_id = public.current_app_user_id()
  );

-- O passado não pode ser reescrito nem por service_role. Correções devem
-- gerar um novo registro compensatório, preservando a cadeia histórica.
CREATE OR REPLACE FUNCTION public.prevent_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$;

CREATE TRIGGER trg_audit_log_append_only
BEFORE UPDATE OR DELETE ON public.audit_log
FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_log_mutation();
