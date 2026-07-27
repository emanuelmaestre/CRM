-- Fase P0 LGPD: solicitacoes auditaveis de titular e fluxo controlado de exportacao/anonimizacao.
-- Rollback:
--   DROP POLICY IF EXISTS rls_lgpd_solicitacao ON public.lgpd_solicitacao;
--   DROP TABLE IF EXISTS public.lgpd_solicitacao;
--   DROP TYPE IF EXISTS public.lgpd_solicitacao_status;
--   DROP TYPE IF EXISTS public.lgpd_solicitacao_tipo;

DO $$ BEGIN
  CREATE TYPE public.lgpd_solicitacao_tipo AS ENUM ('exportacao', 'revogacao', 'anonimizacao', 'exclusao');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE public.lgpd_solicitacao_status AS ENUM ('aberta', 'em_analise', 'concluida', 'rejeitada');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.lgpd_solicitacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.org(id),
  cliente_id uuid NOT NULL REFERENCES public.cliente(id),
  tipo public.lgpd_solicitacao_tipo NOT NULL,
  status public.lgpd_solicitacao_status NOT NULL DEFAULT 'aberta',
  motivo text,
  resultado jsonb,
  solicitante_id uuid REFERENCES public.app_user(id),
  resolvido_por_id uuid REFERENCES public.app_user(id),
  resolvido_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lgpd_solicitacao_org ON public.lgpd_solicitacao(org_id);
CREATE INDEX IF NOT EXISTS idx_lgpd_solicitacao_cliente ON public.lgpd_solicitacao(cliente_id);
CREATE INDEX IF NOT EXISTS idx_lgpd_solicitacao_status ON public.lgpd_solicitacao(status);
CREATE INDEX IF NOT EXISTS idx_lgpd_solicitacao_criado ON public.lgpd_solicitacao(criado_em);

ALTER TABLE public.lgpd_solicitacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lgpd_solicitacao FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_lgpd_solicitacao ON public.lgpd_solicitacao;
CREATE POLICY rls_lgpd_solicitacao ON public.lgpd_solicitacao
  FOR ALL TO PUBLIC
  USING (
    org_id = current_setting('app.current_org_id', true)::uuid
    AND EXISTS (
      SELECT 1 FROM public.cliente c
      WHERE c.id = lgpd_solicitacao.cliente_id
        AND c.org_id = current_setting('app.current_org_id', true)::uuid
    )
  )
  WITH CHECK (
    org_id = current_setting('app.current_org_id', true)::uuid
    AND EXISTS (
      SELECT 1 FROM public.cliente c
      WHERE c.id = lgpd_solicitacao.cliente_id
        AND c.org_id = current_setting('app.current_org_id', true)::uuid
    )
  );
