-- Tokens OAuth por canal/marca (Mercado Livre, Shopee, TikTok Shop, etc.)
CREATE TABLE IF NOT EXISTS canal_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL,
  brand_id    uuid NOT NULL,
  canal       text NOT NULL,                   -- 'mercadolivre' | 'shopee' | 'tiktokshop'
  seller_id   text,                            -- ID do vendedor na plataforma
  access_token  text NOT NULL,
  refresh_token text,
  expires_at    timestamptz,
  scope         text,
  raw           jsonb,                          -- resposta original da API para auditoria
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, brand_id, canal)
);

ALTER TABLE canal_tokens ENABLE ROW LEVEL SECURITY;

-- Somente service_role lê/escreve tokens
CREATE POLICY "service_role only" ON canal_tokens
  USING (auth.role() = 'service_role');

-- Trigger: atualiza updated_at automaticamente
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER canal_tokens_updated_at
  BEFORE UPDATE ON canal_tokens
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
