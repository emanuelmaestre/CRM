-- Integridade do CRM Core (clientes, estoque e funil).
-- Impede duplicações exatas e referências funcionais inválidas mesmo sob concorrência.

CREATE UNIQUE INDEX IF NOT EXISTS uq_cliente_org_email_active
  ON public.cliente (org_id, email)
  WHERE email IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cliente_org_telefone_active
  ON public.cliente (org_id, telefone)
  WHERE telefone IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cliente_org_cpf_active
  ON public.cliente (org_id, cpf_cnpj)
  WHERE cpf_cnpj IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_produto_org_sku_active
  ON public.produto (org_id, sku)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_funil_etapa_org_ordem
  ON public.funil_etapa (org_id, ordem);

ALTER TABLE public.produto DROP CONSTRAINT IF EXISTS chk_produto_preco_positivo;
ALTER TABLE public.produto
  ADD CONSTRAINT chk_produto_preco_positivo CHECK (preco > 0);

ALTER TABLE public.produto DROP CONSTRAINT IF EXISTS chk_produto_custo_positivo;
ALTER TABLE public.produto
  ADD CONSTRAINT chk_produto_custo_positivo CHECK (custo IS NULL OR custo >= 0);

ALTER TABLE public.oportunidade DROP CONSTRAINT IF EXISTS chk_oportunidade_valor_positivo;
ALTER TABLE public.oportunidade
  ADD CONSTRAINT chk_oportunidade_valor_positivo CHECK (valor IS NULL OR valor >= 0);

-- Chaves compostas tornam o tenant parte da própria referência. Isso protege
-- inclusive rotinas internas que usam a role de backend e não dependem de RLS.
ALTER TABLE public.brand ADD CONSTRAINT uq_brand_id_org UNIQUE (id, org_id);
ALTER TABLE public.app_user ADD CONSTRAINT uq_app_user_id_org UNIQUE (id, org_id);
ALTER TABLE public.cliente ADD CONSTRAINT uq_cliente_id_org UNIQUE (id, org_id);
ALTER TABLE public.produto ADD CONSTRAINT uq_produto_id_org UNIQUE (id, org_id);
ALTER TABLE public.funil_etapa ADD CONSTRAINT uq_funil_etapa_id_org UNIQUE (id, org_id);
ALTER TABLE public.channel_account ADD CONSTRAINT uq_channel_account_id_org UNIQUE (id, org_id);

ALTER TABLE public.produto
  ADD CONSTRAINT fk_produto_brand_org FOREIGN KEY (brand_id, org_id)
  REFERENCES public.brand (id, org_id);

ALTER TABLE public.estoque_saldo
  ADD CONSTRAINT fk_estoque_saldo_produto_org FOREIGN KEY (produto_id, org_id)
  REFERENCES public.produto (id, org_id);

ALTER TABLE public.estoque_movimento
  ADD CONSTRAINT fk_estoque_movimento_produto_org FOREIGN KEY (produto_id, org_id)
  REFERENCES public.produto (id, org_id);

ALTER TABLE public.produto_canal
  ADD CONSTRAINT fk_produto_canal_produto_org FOREIGN KEY (produto_id, org_id)
  REFERENCES public.produto (id, org_id);

ALTER TABLE public.produto_canal
  ADD CONSTRAINT fk_produto_canal_conta_org FOREIGN KEY (channel_account_id, org_id)
  REFERENCES public.channel_account (id, org_id);

ALTER TABLE public.oportunidade
  ADD CONSTRAINT fk_oportunidade_brand_org FOREIGN KEY (brand_id, org_id)
  REFERENCES public.brand (id, org_id);

ALTER TABLE public.oportunidade
  ADD CONSTRAINT fk_oportunidade_cliente_org FOREIGN KEY (cliente_id, org_id)
  REFERENCES public.cliente (id, org_id);

ALTER TABLE public.oportunidade
  ADD CONSTRAINT fk_oportunidade_etapa_org FOREIGN KEY (etapa_id, org_id)
  REFERENCES public.funil_etapa (id, org_id);

ALTER TABLE public.oportunidade
  ADD CONSTRAINT fk_oportunidade_responsavel_org FOREIGN KEY (responsavel_id, org_id)
  REFERENCES public.app_user (id, org_id);
