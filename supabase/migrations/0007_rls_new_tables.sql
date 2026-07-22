-- Protege tabelas criadas depois do endurecimento global da migration 0002.
-- Também mantém as policies corrigidas em 0006 compatíveis com a role usada
-- pela aplicação, que depende de app.current_org_id e pode ser dona das tabelas.
-- Rollback: remover rls_produto_canal, desativar FORCE nas duas tabelas e
-- restringir novamente as policies relacionais à role authenticated.

ALTER POLICY rls_cliente_tag ON cliente_tag TO PUBLIC;
ALTER POLICY rls_pedido_item ON pedido_item TO PUBLIC;
ALTER POLICY rls_estoque_movimento_read ON estoque_movimento TO PUBLIC;
ALTER POLICY rls_estoque_movimento_insert ON estoque_movimento TO PUBLIC;

ALTER TABLE produto_canal ENABLE ROW LEVEL SECURITY;
ALTER TABLE produto_canal FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_produto_canal ON produto_canal;
CREATE POLICY rls_produto_canal ON produto_canal
  FOR ALL TO PUBLIC
  USING (
    org_id = current_setting('app.current_org_id', true)::uuid
    AND EXISTS (
      SELECT 1 FROM produto pr
      WHERE pr.id = produto_canal.produto_id
        AND pr.org_id = current_setting('app.current_org_id', true)::uuid
    )
    AND EXISTS (
      SELECT 1 FROM channel_account ca
      WHERE ca.id = produto_canal.channel_account_id
        AND ca.org_id = current_setting('app.current_org_id', true)::uuid
    )
  )
  WITH CHECK (
    org_id = current_setting('app.current_org_id', true)::uuid
    AND EXISTS (
      SELECT 1 FROM produto pr
      WHERE pr.id = produto_canal.produto_id
        AND pr.org_id = current_setting('app.current_org_id', true)::uuid
    )
    AND EXISTS (
      SELECT 1 FROM channel_account ca
      WHERE ca.id = produto_canal.channel_account_id
        AND ca.org_id = current_setting('app.current_org_id', true)::uuid
    )
  );

ALTER TABLE canal_tokens FORCE ROW LEVEL SECURITY;
