-- RLS por identidade e perfil.
--
-- A role `authenticated` recebe o UUID do Supabase Auth em
-- request.jwt.claim.sub. O perfil continua sendo fonte de verdade em app_user;
-- assim, alterar claims no cliente não eleva privilégios.
--
-- Rollback resumido:
--   remover policies rls_active_profile_* e rls_profile_*;
--   remover public.listar_produtos_financeiros();
--   restaurar GRANT SELECT ON produto TO authenticated;

-- A migration de canal_tokens reutilizou o nome set_updated_at para uma coluna
-- diferente. Esta versão atende tanto as tabelas antigas (atualizado_em) quanto
-- canal_tokens (updated_at), sem quebrar updates de perfil.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF to_jsonb(NEW) ? 'atualizado_em' THEN
    NEW := jsonb_populate_record(NEW, jsonb_build_object('atualizado_em', now()));
  ELSIF to_jsonb(NEW) ? 'updated_at' THEN
    NEW := jsonb_populate_record(NEW, jsonb_build_object('updated_at', now()));
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION public.current_app_profile()
RETURNS perfil
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT au.perfil
  FROM public.app_user au
  WHERE au.id = public.current_app_user_id()
    AND au.org_id = nullif(current_setting('app.current_org_id', true), '')::uuid
    AND au.ativo = true
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.current_app_user_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_app_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_app_user_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_app_profile() TO authenticated, service_role;

-- O tenant é definido apenas pelo backend. Um cliente PostgREST não pode usar
-- esta função para trocar de organização.
REVOKE ALL ON FUNCTION public.set_current_org(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_current_org(uuid) TO service_role;

-- Toda role authenticated precisa corresponder a um app_user ativo da org.
DO $$
DECLARE
  table_name text;
BEGIN
  FOR table_name IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity
      AND c.relname <> 'canal_tokens'
  LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      || 'USING (public.current_app_profile() IS NOT NULL) '
      || 'WITH CHECK (public.current_app_profile() IS NOT NULL)',
      'rls_active_profile_' || table_name,
      table_name
    );
  END LOOP;
END $$;

-- Usuários: admin gerencia; gestor consulta a equipe; vendedor vê apenas a si.
CREATE POLICY rls_profile_app_user_select ON app_user
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    public.current_app_profile() IN ('admin', 'gestor')
    OR id = public.current_app_user_id()
  );

CREATE POLICY rls_profile_app_user_insert ON app_user
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.current_app_profile() = 'admin');

CREATE POLICY rls_profile_app_user_update ON app_user
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.current_app_profile() = 'admin')
  WITH CHECK (public.current_app_profile() = 'admin');

CREATE POLICY rls_profile_app_user_delete ON app_user
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.current_app_profile() = 'admin');

-- Organização e marcas são configurações administrativas. Etapas e segmentos
-- podem ser mantidos pelo gestor, mas continuam somente leitura para vendedor.
DO $$
DECLARE
  table_name text;
  command text;
  allowed_expression text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['org', 'brand', 'funil_etapa', 'segmento']
  LOOP
    allowed_expression := CASE
      WHEN table_name IN ('org', 'brand') THEN
        'public.current_app_profile() = ''admin'''
      ELSE
        'public.current_app_profile() IN (''admin'', ''gestor'')'
    END;

    FOREACH command IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE']
    LOOP
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR %s TO authenticated %s',
        'rls_profile_' || table_name || '_' || lower(command),
        table_name,
        command,
        CASE
          WHEN command = 'INSERT' THEN format('WITH CHECK (%s)', allowed_expression)
          WHEN command = 'UPDATE' THEN format(
            'USING (%s) WITH CHECK (%s)',
            allowed_expression,
            allowed_expression
          )
          ELSE format('USING (%s)', allowed_expression)
        END
      );
    END LOOP;
  END LOOP;
END $$;

-- Estoque: vendedor consulta; somente gestor/admin altera catálogo e saldo.
DO $$
DECLARE
  table_name text;
  command text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'produto', 'produto_canal', 'estoque_saldo', 'estoque_movimento'
  ]
  LOOP
    FOREACH command IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE']
    LOOP
      -- estoque_movimento é append-only e não possui policy de UPDATE/DELETE.
      IF table_name = 'estoque_movimento' AND command <> 'INSERT' THEN
        CONTINUE;
      END IF;

      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR %s TO authenticated %s',
        'rls_profile_' || table_name || '_' || lower(command),
        table_name,
        command,
        CASE
          WHEN command = 'INSERT' THEN
            'WITH CHECK (public.current_app_profile() IN (''admin'', ''gestor''))'
          WHEN command = 'UPDATE' THEN
            'USING (public.current_app_profile() IN (''admin'', ''gestor'')) '
            || 'WITH CHECK (public.current_app_profile() IN (''admin'', ''gestor''))'
          ELSE
            'USING (public.current_app_profile() IN (''admin'', ''gestor''))'
        END
      );
    END LOOP;
  END LOOP;
END $$;

-- Áreas gerenciais não ficam visíveis ao vendedor nem por acesso direto.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'import_lote', 'regua', 'template_mensagem', 'regua_execucao',
    'score_cliente', 'score_produto', 'insight', 'sugestao_campanha',
    'documento_gerado'
  ]
  LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      || 'USING (public.current_app_profile() IN (''admin'', ''gestor'')) '
      || 'WITH CHECK (public.current_app_profile() IN (''admin'', ''gestor''))',
      'rls_profile_manager_' || table_name,
      table_name
    );
  END LOOP;
END $$;

-- Eventos de domínio são uma fila interna: nenhuma sessão de usuário os
-- consulta ou altera diretamente, independentemente do perfil.
CREATE POLICY rls_profile_backend_evento_dominio ON evento_dominio
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

-- Configurações, auditoria, saúde e custos operacionais são exclusivos do admin.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'channel_account', 'audit_log', 'job_run', 'llm_run'
  ]
  LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      || 'USING (public.current_app_profile() = ''admin'') '
      || 'WITH CHECK (public.current_app_profile() = ''admin'')',
      'rls_profile_admin_' || table_name,
      table_name
    );
  END LOOP;
END $$;

-- Custo é protegido por privilégio de coluna; RLS não mascara colunas.
REVOKE SELECT ON TABLE public.produto FROM authenticated;
GRANT SELECT (
  id, org_id, brand_id, sku, nome, preco, estoque_minimo, ativo,
  deleted_at, criado_em, atualizado_em
) ON TABLE public.produto TO authenticated;

CREATE OR REPLACE FUNCTION public.listar_produtos_financeiros()
RETURNS TABLE (
  id uuid,
  org_id uuid,
  brand_id uuid,
  sku text,
  nome text,
  custo numeric,
  preco numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p.id, p.org_id, p.brand_id, p.sku, p.nome, p.custo, p.preco
  FROM public.produto p
  WHERE p.org_id = nullif(current_setting('app.current_org_id', true), '')::uuid
    AND public.current_app_profile() IN ('admin', 'gestor')
$$;

REVOKE ALL ON FUNCTION public.listar_produtos_financeiros() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_produtos_financeiros() TO authenticated, service_role;
