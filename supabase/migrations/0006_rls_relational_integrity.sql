-- Impede referências cruzadas entre tenants em tabelas relacionais.
-- Rollback: restaurar as policies anteriores de 0001_initial_schema.sql.

DROP POLICY IF EXISTS rls_cliente_tag ON cliente_tag;
CREATE POLICY rls_cliente_tag ON cliente_tag
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM cliente c
      WHERE c.id = cliente_tag.cliente_id
        AND c.org_id = current_setting('app.current_org_id', true)::uuid
    )
    AND EXISTS (
      SELECT 1 FROM tag t
      WHERE t.id = cliente_tag.tag_id
        AND t.org_id = current_setting('app.current_org_id', true)::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM cliente c
      WHERE c.id = cliente_tag.cliente_id
        AND c.org_id = current_setting('app.current_org_id', true)::uuid
    )
    AND EXISTS (
      SELECT 1 FROM tag t
      WHERE t.id = cliente_tag.tag_id
        AND t.org_id = current_setting('app.current_org_id', true)::uuid
    )
  );

DROP POLICY IF EXISTS rls_pedido_item ON pedido_item;
CREATE POLICY rls_pedido_item ON pedido_item
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM pedido p
      WHERE p.id = pedido_item.pedido_id
        AND p.org_id = current_setting('app.current_org_id', true)::uuid
    )
    AND EXISTS (
      SELECT 1 FROM produto pr
      WHERE pr.id = pedido_item.produto_id
        AND pr.org_id = current_setting('app.current_org_id', true)::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM pedido p
      WHERE p.id = pedido_item.pedido_id
        AND p.org_id = current_setting('app.current_org_id', true)::uuid
    )
    AND EXISTS (
      SELECT 1 FROM produto pr
      WHERE pr.id = pedido_item.produto_id
        AND pr.org_id = current_setting('app.current_org_id', true)::uuid
    )
  );

DROP POLICY IF EXISTS rls_estoque_movimento_read ON estoque_movimento;
CREATE POLICY rls_estoque_movimento_read ON estoque_movimento
  FOR SELECT TO authenticated
  USING (
    org_id = current_setting('app.current_org_id', true)::uuid
    AND EXISTS (
      SELECT 1 FROM produto pr
      WHERE pr.id = estoque_movimento.produto_id
        AND pr.org_id = current_setting('app.current_org_id', true)::uuid
    )
  );

DROP POLICY IF EXISTS rls_estoque_movimento_insert ON estoque_movimento;
CREATE POLICY rls_estoque_movimento_insert ON estoque_movimento
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = current_setting('app.current_org_id', true)::uuid
    AND EXISTS (
      SELECT 1 FROM produto pr
      WHERE pr.id = estoque_movimento.produto_id
        AND pr.org_id = current_setting('app.current_org_id', true)::uuid
    )
  );
