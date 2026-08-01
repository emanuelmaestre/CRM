-- A interface e os conectores operam uma conta por canal em cada marca.
-- Estes índices tornam o provisionamento das três marcas idempotente também
-- sob concorrência e impedem slugs ambíguos dentro do mesmo tenant.

CREATE UNIQUE INDEX IF NOT EXISTS uq_brand_org_slug
  ON public.brand (org_id, slug);

CREATE UNIQUE INDEX IF NOT EXISTS uq_channel_account_org_brand_tipo
  ON public.channel_account (org_id, brand_id, tipo);

-- O org_id e o brand_id formam uma fronteira única. As chaves compostas
-- impedem que rotinas com service role associem uma conta externa a outra
-- marca do mesmo tenant por engano.
ALTER TABLE public.channel_account
  ADD CONSTRAINT uq_channel_account_id_org_brand UNIQUE (id, org_id, brand_id);

ALTER TABLE public.channel_account
  ADD CONSTRAINT fk_channel_account_brand_org FOREIGN KEY (brand_id, org_id)
  REFERENCES public.brand (id, org_id);

ALTER TABLE public.pedido
  ADD CONSTRAINT fk_pedido_brand_org FOREIGN KEY (brand_id, org_id)
  REFERENCES public.brand (id, org_id);

ALTER TABLE public.pedido
  ADD CONSTRAINT fk_pedido_conta_org_brand
  FOREIGN KEY (channel_account_id, org_id, brand_id)
  REFERENCES public.channel_account (id, org_id, brand_id);

ALTER TABLE public.conversa
  ADD CONSTRAINT fk_conversa_brand_org FOREIGN KEY (brand_id, org_id)
  REFERENCES public.brand (id, org_id);

ALTER TABLE public.conversa
  ADD CONSTRAINT fk_conversa_conta_org_brand
  FOREIGN KEY (channel_account_id, org_id, brand_id)
  REFERENCES public.channel_account (id, org_id, brand_id);

CREATE OR REPLACE FUNCTION public.enforce_produto_canal_brand()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  produto_brand uuid;
  conta_brand uuid;
BEGIN
  SELECT brand_id INTO produto_brand
  FROM public.produto
  WHERE id = NEW.produto_id AND org_id = NEW.org_id;

  SELECT brand_id INTO conta_brand
  FROM public.channel_account
  WHERE id = NEW.channel_account_id AND org_id = NEW.org_id;

  IF produto_brand IS NOT NULL AND conta_brand IS NOT NULL AND produto_brand <> conta_brand THEN
    RAISE EXCEPTION 'Produto e conta externa devem pertencer à mesma marca.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_produto_canal_same_brand
  BEFORE INSERT OR UPDATE OF org_id, produto_id, channel_account_id
  ON public.produto_canal
  FOR EACH ROW EXECUTE FUNCTION public.enforce_produto_canal_brand();
