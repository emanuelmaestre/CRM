-- Importacao historica de pedidos de marketplace.
-- O lote e o JSON original ficam persistidos antes da promocao ao CRM.
-- Pedidos historicos nao publicam eventos operacionais e, portanto, nao
-- movimentam estoque, nao sincronizam saldo e nao iniciam reguas pos-venda.

ALTER TABLE public.import_lote
  ADD COLUMN IF NOT EXISTS brand_id uuid,
  ADD COLUMN IF NOT EXISTS channel_account_id uuid,
  ADD COLUMN IF NOT EXISTS fase text NOT NULL DEFAULT 'preparacao',
  ADD COLUMN IF NOT EXISTS progresso integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS configuracao jsonb,
  ADD COLUMN IF NOT EXISTS solicitado_por_id uuid;

ALTER TABLE public.import_lote
  ADD CONSTRAINT chk_import_lote_progresso
  CHECK (progresso BETWEEN 0 AND 100);

ALTER TABLE public.import_lote
  ADD CONSTRAINT fk_import_lote_brand_org
  FOREIGN KEY (brand_id, org_id) REFERENCES public.brand (id, org_id);

ALTER TABLE public.import_lote
  ADD CONSTRAINT fk_import_lote_conta_org_brand
  FOREIGN KEY (channel_account_id, org_id, brand_id)
  REFERENCES public.channel_account (id, org_id, brand_id);

ALTER TABLE public.import_lote
  ADD CONSTRAINT fk_import_lote_usuario_org
  FOREIGN KEY (solicitado_por_id, org_id)
  REFERENCES public.app_user (id, org_id);

CREATE INDEX IF NOT EXISTS idx_import_brand
  ON public.import_lote (brand_id);

CREATE INDEX IF NOT EXISTS idx_import_channel_account
  ON public.import_lote (channel_account_id);

CREATE TABLE IF NOT EXISTS public.import_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.org(id),
  lote_id uuid NOT NULL REFERENCES public.import_lote(id) ON DELETE CASCADE,
  provider_record_id text NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  payload jsonb NOT NULL,
  erros jsonb,
  pedido_id uuid REFERENCES public.pedido(id),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_import_item_status CHECK (
    status IN ('pendente', 'validado', 'quarentena', 'duplicado', 'importando', 'importado', 'erro')
  ),
  CONSTRAINT uq_import_item_lote_provider UNIQUE (lote_id, provider_record_id)
);

CREATE INDEX IF NOT EXISTS idx_import_item_org
  ON public.import_item (org_id);

CREATE INDEX IF NOT EXISTS idx_import_item_lote_status
  ON public.import_item (lote_id, status);

CREATE TRIGGER trg_import_item_updated_at
  BEFORE UPDATE ON public.import_item
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.import_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_item FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_import_item ON public.import_item
  FOR ALL TO PUBLIC
  USING (org_id = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.current_org_id', true), '')::uuid);

CREATE POLICY rls_profile_manager_import_item ON public.import_item
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.current_app_profile() IN ('admin', 'gestor'))
  WITH CHECK (public.current_app_profile() IN ('admin', 'gestor'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_item TO authenticated, service_role;

ALTER TABLE public.pedido
  ADD COLUMN IF NOT EXISTS origem_ingestao text NOT NULL DEFAULT 'tempo_real',
  ADD COLUMN IF NOT EXISTS import_lote_id uuid REFERENCES public.import_lote(id),
  ADD COLUMN IF NOT EXISTS importado_em timestamptz;

ALTER TABLE public.pedido
  ADD CONSTRAINT chk_pedido_origem_ingestao
  CHECK (origem_ingestao IN ('tempo_real', 'historico'));

ALTER TABLE public.pedido
  ADD CONSTRAINT chk_pedido_historico_lote
  CHECK (
    (origem_ingestao = 'tempo_real' AND import_lote_id IS NULL)
    OR
    (origem_ingestao = 'historico' AND import_lote_id IS NOT NULL AND importado_em IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_pedido_import_lote
  ON public.pedido (import_lote_id);

-- Impede que um update futuro transforme silenciosamente um historico em
-- pedido de tempo real e libere efeitos operacionais retroativos.
CREATE OR REPLACE FUNCTION public.protect_pedido_historical_origin()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.origem_ingestao = 'historico' AND NEW.origem_ingestao <> 'historico' THEN
    RAISE EXCEPTION 'A origem historica do pedido e imutavel.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pedido_historical_origin
  BEFORE UPDATE OF origem_ingestao ON public.pedido
  FOR EACH ROW EXECUTE FUNCTION public.protect_pedido_historical_origin();
