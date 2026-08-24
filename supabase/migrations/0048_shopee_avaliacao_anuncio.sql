CREATE TABLE "shopee_avaliacao_anuncio" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "brand_id" uuid NOT NULL,
  "channel_account_id" uuid NOT NULL,
  "item_id" text NOT NULL,
  "title" text NOT NULL,
  "rating_average" real,
  "reviews_total" integer,
  "rating_levels" jsonb,
  "opinioes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shopee_avaliacao_anuncio" ADD CONSTRAINT "shopee_avaliacao_anuncio_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "shopee_avaliacao_anuncio" ADD CONSTRAINT "shopee_avaliacao_anuncio_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "shopee_avaliacao_anuncio" ADD CONSTRAINT "shopee_avaliacao_anuncio_channel_account_id_channel_account_id_fk" FOREIGN KEY ("channel_account_id") REFERENCES "public"."channel_account"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_shopee_avaliacao_org_item" ON "shopee_avaliacao_anuncio" USING btree ("org_id","item_id");
--> statement-breakpoint
CREATE INDEX "idx_shopee_avaliacao_brand" ON "shopee_avaliacao_anuncio" USING btree ("brand_id");
--> statement-breakpoint
ALTER TABLE "shopee_avaliacao_anuncio" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shopee_avaliacao_anuncio" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "rls_shopee_avaliacao_anuncio" ON "shopee_avaliacao_anuncio"
  FOR ALL TO authenticated
  USING (org_id = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.current_org_id', true), '')::uuid);
