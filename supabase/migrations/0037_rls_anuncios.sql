-- ads_advertiser, ads_campanha_snapshot e ads_anuncio_snapshot (modulo
-- Anuncios/Product Ads) sao multi-tenant (org_id) mas ficaram sem RLS desde
-- a criacao -- achado do pentest de compliance ML entregue em 17/08/2026,
-- mesmo padrao de isolamento por org_id ja aplicado em channel_account/
-- conversa/ml_avaliacao_anuncio.

ALTER TABLE public.ads_advertiser ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads_advertiser FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_ads_advertiser ON public.ads_advertiser
  FOR ALL TO authenticated
  USING (org_id = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE public.ads_campanha_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads_campanha_snapshot FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_ads_campanha_snapshot ON public.ads_campanha_snapshot
  FOR ALL TO authenticated
  USING (org_id = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE public.ads_anuncio_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads_anuncio_snapshot FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_ads_anuncio_snapshot ON public.ads_anuncio_snapshot
  FOR ALL TO authenticated
  USING (org_id = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.current_org_id', true), '')::uuid);
