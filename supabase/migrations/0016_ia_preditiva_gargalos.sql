-- Item 05 (IA preditiva): segmento/acao sugerida por cliente, melhor momento
-- de contato em sugestao de campanha, e tempo-na-etapa + motivo de perda no
-- funil (analise de gargalo e motivos de perda).
-- Rollback:
--   ALTER TABLE public.score_cliente DROP COLUMN IF EXISTS segmento;
--   ALTER TABLE public.score_cliente DROP COLUMN IF EXISTS acao_sugerida;
--   ALTER TABLE public.sugestao_campanha DROP COLUMN IF EXISTS momento_sugerido;
--   ALTER TABLE public.oportunidade DROP COLUMN IF EXISTS entrou_etapa_em;
--   ALTER TABLE public.oportunidade DROP COLUMN IF EXISTS motivo_perda;

ALTER TABLE public.score_cliente ADD COLUMN IF NOT EXISTS segmento text;
ALTER TABLE public.score_cliente ADD COLUMN IF NOT EXISTS acao_sugerida text;

ALTER TABLE public.sugestao_campanha ADD COLUMN IF NOT EXISTS momento_sugerido text;

ALTER TABLE public.oportunidade ADD COLUMN IF NOT EXISTS entrou_etapa_em timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.oportunidade ADD COLUMN IF NOT EXISTS motivo_perda text;
