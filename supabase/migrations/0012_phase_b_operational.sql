-- Fase B: isolamento por conta externa e limites operacionais das réguas.
-- Rollback:
--   ALTER TABLE public.pedido DROP CONSTRAINT IF EXISTS fk_pedido_channel_account_org;
--   ALTER TABLE public.pedido DROP CONSTRAINT IF EXISTS pedido_channel_account_id_channel_account_id_fk;
--   DROP INDEX IF EXISTS uq_pedido_org_canal_provider_legacy;
--   DROP INDEX IF EXISTS uq_pedido_org_account_provider;
--   CREATE UNIQUE INDEX uq_pedido_org_canal_provider ON public.pedido(org_id, canal, provider_order_id)
--     WHERE provider_order_id IS NOT NULL;
--   ALTER TABLE public.pedido DROP COLUMN IF EXISTS channel_account_id;
--   ALTER TABLE public.regua DROP COLUMN IF EXISTS cooldown_horas;
--   ALTER TABLE public.regua DROP COLUMN IF EXISTS limite_diario_cliente;
--   ALTER TABLE public.produto_canal DROP COLUMN IF EXISTS external_sku_id;
--   ALTER TABLE public.produto_canal DROP COLUMN IF EXISTS external_warehouse_id;

ALTER TABLE public.pedido
  ADD COLUMN IF NOT EXISTS channel_account_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pedido_channel_account_id_channel_account_id_fk'
  ) THEN
    ALTER TABLE public.pedido
      ADD CONSTRAINT pedido_channel_account_id_channel_account_id_fk
      FOREIGN KEY (channel_account_id) REFERENCES public.channel_account(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_pedido_channel_account_org'
  ) THEN
    ALTER TABLE public.pedido
      ADD CONSTRAINT fk_pedido_channel_account_org
      FOREIGN KEY (channel_account_id, org_id)
      REFERENCES public.channel_account(id, org_id);
  END IF;
END $$;

DROP INDEX IF EXISTS public.uq_pedido_org_canal_provider;

CREATE INDEX IF NOT EXISTS idx_pedido_channel_account
  ON public.pedido(channel_account_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pedido_org_account_provider
  ON public.pedido(org_id, channel_account_id, provider_order_id)
  WHERE channel_account_id IS NOT NULL AND provider_order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pedido_org_canal_provider_legacy
  ON public.pedido(org_id, canal, provider_order_id)
  WHERE channel_account_id IS NULL AND provider_order_id IS NOT NULL;

ALTER TABLE public.regua
  ADD COLUMN IF NOT EXISTS cooldown_horas integer NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS limite_diario_cliente integer NOT NULL DEFAULT 1;

ALTER TABLE public.produto_canal
  ADD COLUMN IF NOT EXISTS external_sku_id text,
  ADD COLUMN IF NOT EXISTS external_warehouse_id text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'regua_cooldown_horas_check') THEN
    ALTER TABLE public.regua
      ADD CONSTRAINT regua_cooldown_horas_check CHECK (cooldown_horas >= 0 AND cooldown_horas <= 8760);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'regua_limite_diario_cliente_check') THEN
    ALTER TABLE public.regua
      ADD CONSTRAINT regua_limite_diario_cliente_check CHECK (limite_diario_cliente >= 1 AND limite_diario_cliente <= 100);
  END IF;
END $$;
