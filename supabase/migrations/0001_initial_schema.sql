-- =============================================================================
-- CRM LEO — Migração inicial
-- Drizzle cria as tabelas; esta migração adiciona:
--   1. Trigger set_updated_at em todas as tabelas com atualizado_em
--   2. RLS habilitado + policies org_id em todas as tabelas
--   3. Constraints CHECK para state machines
--   4. Índices GIN para busca de texto
--   5. Constraint de saldo não-negativo no estoque
--   6. Unique constraint idempotência inbox
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. FUNÇÃO UTILITÁRIA: set_updated_at
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 2. TRIGGERS set_updated_at
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_org_updated_at
  BEFORE UPDATE ON org
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_brand_updated_at
  BEFORE UPDATE ON brand
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_app_user_updated_at
  BEFORE UPDATE ON app_user
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_cliente_updated_at
  BEFORE UPDATE ON cliente
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_segmento_updated_at
  BEFORE UPDATE ON segmento
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_produto_updated_at
  BEFORE UPDATE ON produto
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_estoque_saldo_updated_at
  BEFORE UPDATE ON estoque_saldo
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_pedido_updated_at
  BEFORE UPDATE ON pedido
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_oportunidade_updated_at
  BEFORE UPDATE ON oportunidade
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_tarefa_updated_at
  BEFORE UPDATE ON tarefa
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_channel_account_updated_at
  BEFORE UPDATE ON channel_account
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_conversa_updated_at
  BEFORE UPDATE ON conversa
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_regua_updated_at
  BEFORE UPDATE ON regua
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_template_mensagem_updated_at
  BEFORE UPDATE ON template_mensagem
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_regua_execucao_updated_at
  BEFORE UPDATE ON regua_execucao
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_sugestao_campanha_updated_at
  BEFORE UPDATE ON sugestao_campanha
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------

-- Habilitar RLS em todas as tabelas de dados
ALTER TABLE org                ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand              ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_user           ENABLE ROW LEVEL SECURITY;
ALTER TABLE cliente            ENABLE ROW LEVEL SECURITY;
ALTER TABLE cliente_identidade ENABLE ROW LEVEL SECURITY;
ALTER TABLE consentimento      ENABLE ROW LEVEL SECURITY;
ALTER TABLE tag                ENABLE ROW LEVEL SECURITY;
ALTER TABLE cliente_tag        ENABLE ROW LEVEL SECURITY;
ALTER TABLE segmento           ENABLE ROW LEVEL SECURITY;
ALTER TABLE interacao          ENABLE ROW LEVEL SECURITY;
ALTER TABLE produto            ENABLE ROW LEVEL SECURITY;
ALTER TABLE estoque_saldo      ENABLE ROW LEVEL SECURITY;
ALTER TABLE estoque_movimento  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedido             ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedido_item        ENABLE ROW LEVEL SECURITY;
ALTER TABLE funil_etapa        ENABLE ROW LEVEL SECURITY;
ALTER TABLE oportunidade       ENABLE ROW LEVEL SECURITY;
ALTER TABLE tarefa             ENABLE ROW LEVEL SECURITY;
ALTER TABLE evento_agenda      ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log          ENABLE ROW LEVEL SECURITY;
ALTER TABLE evento_dominio     ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_run            ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_account    ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversa           ENABLE ROW LEVEL SECURITY;
ALTER TABLE mensagem           ENABLE ROW LEVEL SECURITY;
ALTER TABLE regua              ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_mensagem  ENABLE ROW LEVEL SECURITY;
ALTER TABLE regua_execucao     ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_lote        ENABLE ROW LEVEL SECURITY;
ALTER TABLE score_cliente      ENABLE ROW LEVEL SECURITY;
ALTER TABLE score_produto      ENABLE ROW LEVEL SECURITY;
ALTER TABLE insight            ENABLE ROW LEVEL SECURITY;
ALTER TABLE sugestao_campanha  ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_run            ENABLE ROW LEVEL SECURITY;
ALTER TABLE documento_gerado   ENABLE ROW LEVEL SECURITY;

-- service_role bypassa RLS (server-side Next.js usa service_role)
-- Policies abaixo são para acesso autenticado via JWT (anon role)

-- org: visível para usuários da mesma org
CREATE POLICY rls_org ON org
  FOR ALL TO authenticated
  USING (id = current_setting('app.current_org_id', true)::uuid);

-- brand: visível para a org corrente
CREATE POLICY rls_brand ON brand
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- app_user
CREATE POLICY rls_app_user ON app_user
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- cliente
CREATE POLICY rls_cliente ON cliente
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- cliente_identidade (via join com cliente)
CREATE POLICY rls_cliente_identidade ON cliente_identidade
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- consentimento
CREATE POLICY rls_consentimento ON consentimento
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- tag
CREATE POLICY rls_tag ON tag
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- cliente_tag (via join)
CREATE POLICY rls_cliente_tag ON cliente_tag
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM cliente c
      WHERE c.id = cliente_tag.cliente_id
        AND c.org_id = current_setting('app.current_org_id', true)::uuid
    )
  );

-- segmento
CREATE POLICY rls_segmento ON segmento
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- interacao
CREATE POLICY rls_interacao ON interacao
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- produto
CREATE POLICY rls_produto ON produto
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- estoque_saldo
CREATE POLICY rls_estoque_saldo ON estoque_saldo
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- estoque_movimento: insert-only para usuários; leitura livre dentro da org
CREATE POLICY rls_estoque_movimento_read ON estoque_movimento
  FOR SELECT TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

CREATE POLICY rls_estoque_movimento_insert ON estoque_movimento
  FOR INSERT TO authenticated
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

-- pedido
CREATE POLICY rls_pedido ON pedido
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- pedido_item (via join com pedido)
CREATE POLICY rls_pedido_item ON pedido_item
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM pedido p
      WHERE p.id = pedido_item.pedido_id
        AND p.org_id = current_setting('app.current_org_id', true)::uuid
    )
  );

-- funil_etapa
CREATE POLICY rls_funil_etapa ON funil_etapa
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- oportunidade
CREATE POLICY rls_oportunidade ON oportunidade
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- tarefa
CREATE POLICY rls_tarefa ON tarefa
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- evento_agenda
CREATE POLICY rls_evento_agenda ON evento_agenda
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- audit_log: somente leitura para usuários; escrita via service_role
CREATE POLICY rls_audit_log_read ON audit_log
  FOR SELECT TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- evento_dominio
CREATE POLICY rls_evento_dominio ON evento_dominio
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- job_run
CREATE POLICY rls_job_run ON job_run
  FOR SELECT TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- channel_account
CREATE POLICY rls_channel_account ON channel_account
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- conversa
CREATE POLICY rls_conversa ON conversa
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- mensagem (via join com conversa)
CREATE POLICY rls_mensagem ON mensagem
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- regua
CREATE POLICY rls_regua ON regua
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- template_mensagem
CREATE POLICY rls_template_mensagem ON template_mensagem
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- regua_execucao
CREATE POLICY rls_regua_execucao ON regua_execucao
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- import_lote
CREATE POLICY rls_import_lote ON import_lote
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- score_cliente
CREATE POLICY rls_score_cliente ON score_cliente
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- score_produto
CREATE POLICY rls_score_produto ON score_produto
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- insight
CREATE POLICY rls_insight ON insight
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- sugestao_campanha
CREATE POLICY rls_sugestao_campanha ON sugestao_campanha
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- llm_run: somente leitura para usuários
CREATE POLICY rls_llm_run_read ON llm_run
  FOR SELECT TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- documento_gerado
CREATE POLICY rls_documento_gerado ON documento_gerado
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- ---------------------------------------------------------------------------
-- 4. CONSTRAINTS CHECK — State Machines
-- ---------------------------------------------------------------------------

-- Pedido: status válidos (reforça o enum no nível DB)
ALTER TABLE pedido
  ADD CONSTRAINT chk_pedido_status CHECK (
    status IN (
      'criado', 'pago', 'separado', 'enviado', 'entregue',
      'avaliacao_solicitada', 'concluido', 'cancelado', 'devolvido'
    )
  );

-- Pedido: total >= 0
ALTER TABLE pedido
  ADD CONSTRAINT chk_pedido_total_positivo CHECK (total >= 0);

-- Pedido: frete e desconto >= 0
ALTER TABLE pedido
  ADD CONSTRAINT chk_pedido_frete_positivo CHECK (frete IS NULL OR frete >= 0);

ALTER TABLE pedido
  ADD CONSTRAINT chk_pedido_desconto_positivo CHECK (desconto IS NULL OR desconto >= 0);

-- Conversa: status válidos
ALTER TABLE conversa
  ADD CONSTRAINT chk_conversa_status CHECK (
    status IN ('nova', 'em_atendimento', 'aguardando_cliente', 'resolvida', 'arquivada')
  );

-- Estoque movimento: quantidade > 0 (nunca zero ou negativo)
ALTER TABLE estoque_movimento
  ADD CONSTRAINT chk_movimento_quantidade_positiva CHECK (quantidade > 0);

-- Score: churn_risk entre 0 e 100
ALTER TABLE score_cliente
  ADD CONSTRAINT chk_churn_risk_range CHECK (churn_risk BETWEEN 0 AND 100);

-- Score produto: risco_encalhe entre 0 e 100
ALTER TABLE score_produto
  ADD CONSTRAINT chk_risco_encalhe_range CHECK (risco_encalhe BETWEEN 0 AND 100);

-- Pedido item: quantidade > 0
ALTER TABLE pedido_item
  ADD CONSTRAINT chk_item_quantidade_positiva CHECK (quantidade > 0);

-- Pedido item: preco_unitario >= 0
ALTER TABLE pedido_item
  ADD CONSTRAINT chk_item_preco_positivo CHECK (preco_unitario >= 0);

-- Produto: preco >= 0
ALTER TABLE produto
  ADD CONSTRAINT chk_produto_preco_positivo CHECK (preco >= 0);

-- Produto: estoque_minimo >= 0
ALTER TABLE produto
  ADD CONSTRAINT chk_produto_estoque_minimo CHECK (estoque_minimo >= 0);

-- LLM run: custo >= 0
ALTER TABLE llm_run
  ADD CONSTRAINT chk_llm_custo_positivo CHECK (custo_usd IS NULL OR custo_usd >= 0);

-- ---------------------------------------------------------------------------
-- 5. CONSTRAINT: estoque_saldo não negativo (livro-razão invariante)
-- ---------------------------------------------------------------------------
-- Nota: a validação primária é feita em código (domain/entities.ts).
-- Este CHECK é a última linha de defesa no banco.
ALTER TABLE estoque_saldo
  ADD CONSTRAINT chk_saldo_nao_negativo CHECK (saldo >= 0);

-- ---------------------------------------------------------------------------
-- 6. UNIQUE: idempotência de mensagens no inbox
-- ---------------------------------------------------------------------------
-- Evita duplicata de mensagem recebida do webhook Z-API
ALTER TABLE mensagem
  ADD CONSTRAINT uq_mensagem_provider UNIQUE (provider_message_id)
  DEFERRABLE INITIALLY DEFERRED;

-- Idempotência de execução de régua (já definida no schema Drizzle como .unique(),
-- mas garantimos explicitamente aqui com nome descritivo)
-- (já existe via Drizzle: regua_execucao.idempotency_key é unique)

-- ---------------------------------------------------------------------------
-- 7. ÍNDICES GIN — busca de texto full-text
-- ---------------------------------------------------------------------------

-- Busca de cliente por nome (tsvector)
CREATE INDEX idx_cliente_nome_fts ON cliente
  USING GIN (to_tsvector('portuguese', nome));

-- Busca de cliente por email (pg_trgm para ILIKE rápido)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX idx_cliente_email_trgm ON cliente
  USING GIN (email gin_trgm_ops);

CREATE INDEX idx_cliente_telefone_trgm ON cliente
  USING GIN (telefone gin_trgm_ops);

CREATE INDEX idx_cliente_nome_trgm ON cliente
  USING GIN (nome gin_trgm_ops);

-- Busca de produto por nome/sku
CREATE INDEX idx_produto_nome_trgm ON produto
  USING GIN (nome gin_trgm_ops);

CREATE INDEX idx_produto_sku_trgm ON produto
  USING GIN (sku gin_trgm_ops);

-- Busca de conversa por conteúdo de mensagem
CREATE INDEX idx_mensagem_conteudo_fts ON mensagem
  USING GIN (to_tsvector('portuguese', conteudo));

-- ---------------------------------------------------------------------------
-- 8. ÍNDICES COMPOSTOS adicionais (performance)
-- ---------------------------------------------------------------------------

-- Pedidos por org + status + data (dashboard principal)
CREATE INDEX idx_pedido_org_status_data ON pedido (org_id, status, criado_em DESC);

-- Régua execuções pendentes (job A8, A9, A10 consultam isso)
CREATE INDEX idx_execucao_pendentes ON regua_execucao (org_id, status, agendada_em)
  WHERE status IN ('elegivel', 'agendada');

-- Score cliente por churn alto (job A10)
CREATE INDEX idx_score_churn_alto ON score_cliente (org_id, churn_risk DESC)
  WHERE churn_risk >= 70;

-- Movimentos por produto + data (livro-razão)
CREATE INDEX idx_movimento_produto_data ON estoque_movimento (produto_id, criado_em DESC);

-- Consentimento ativo por cliente + brand + finalidade (Gate 1)
CREATE INDEX idx_consentimento_ativo ON consentimento (cliente_id, brand_id, finalidade, status)
  WHERE status = 'ativo';

-- Conversa aberta por org + brand (inbox dashboard)
CREATE INDEX idx_conversa_aberta ON conversa (org_id, brand_id, status, criado_em DESC)
  WHERE status IN ('nova', 'em_atendimento', 'aguardando_cliente');

-- LLM run por org + data (controle de budget mensal)
CREATE INDEX idx_llm_run_budget ON llm_run (org_id, criado_em DESC);

-- Sugestão campanha pendente aprovação
CREATE INDEX idx_sugestao_pendente ON sugestao_campanha (org_id, status, criado_em DESC)
  WHERE status = 'sugerida';

-- ---------------------------------------------------------------------------
-- 9. FUNÇÃO: definir org corrente (usada pelas policies RLS)
-- ---------------------------------------------------------------------------
-- O servidor chama esta função antes de qualquer query autenticada.
-- Exemplo de uso no Next.js:
--   await db.execute(sql`SELECT set_config('app.current_org_id', ${orgId}, true)`)
CREATE OR REPLACE FUNCTION set_current_org(p_org_id uuid)
RETURNS void AS $$
BEGIN
  PERFORM set_config('app.current_org_id', p_org_id::text, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
