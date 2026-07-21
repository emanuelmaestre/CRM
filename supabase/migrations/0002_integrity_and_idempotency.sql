-- Fase 2: endurecimento das policies RLS.
-- As mudanças declarativas de schema e idempotência estão na migração 0003,
-- gerada pelo Drizzle e acompanhada do respectivo snapshot.

ALTER TABLE mensagem DROP CONSTRAINT IF EXISTS uq_mensagem_provider;

-- A funcao apenas configura a transacao/sessao corrente e nao precisa executar
-- com os privilegios do proprietario. O search_path fixo evita object shadowing.
ALTER FUNCTION public.set_current_org(uuid) SECURITY INVOKER;
ALTER FUNCTION public.set_current_org(uuid) SET search_path = pg_catalog, public;

-- A aplicação conecta com uma org fixa por implantação. As policies valem para
-- qualquer role sem BYPASSRLS; FORCE impede que o proprietário as ignore.
DO $$
DECLARE policy_row record;
BEGIN
  FOR policy_row IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format(
      'ALTER POLICY %I ON %I.%I TO PUBLIC',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  END LOOP;
END $$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'org', 'brand', 'app_user', 'cliente', 'cliente_identidade',
    'consentimento', 'tag', 'cliente_tag', 'segmento', 'interacao',
    'produto', 'estoque_saldo', 'estoque_movimento', 'pedido',
    'pedido_item', 'funil_etapa', 'oportunidade', 'tarefa',
    'evento_agenda', 'audit_log', 'evento_dominio', 'job_run',
    'channel_account', 'conversa', 'mensagem', 'regua',
    'template_mensagem', 'regua_execucao', 'import_lote',
    'score_cliente', 'score_produto', 'insight', 'sugestao_campanha',
    'llm_run', 'documento_gerado'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
  END LOOP;
END $$;
