CREATE TABLE "ads_advertiser" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"channel_account_id" uuid NOT NULL,
	"advertiser_id" text NOT NULL,
	"site_id" text NOT NULL,
	"descoberto_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ads_anuncio_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"channel_account_id" uuid NOT NULL,
	"campaign_id" text NOT NULL,
	"item_id" text NOT NULL,
	"produto_id" uuid,
	"data" date NOT NULL,
	"titulo" text,
	"status" text,
	"preco" numeric(12, 2),
	"clicks" integer,
	"prints" integer,
	"ctr" numeric(8, 4),
	"cost" numeric(12, 2),
	"cpc" numeric(10, 4),
	"acos" numeric(8, 4),
	"roas" numeric(8, 4),
	"cvr" numeric(8, 4),
	"organic_units_quantity" integer,
	"direct_units_quantity" integer,
	"indirect_units_quantity" integer,
	"units_quantity" integer,
	"direct_amount" numeric(12, 2),
	"indirect_amount" numeric(12, 2),
	"total_amount" numeric(12, 2),
	"bruto" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ads_campanha_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"channel_account_id" uuid NOT NULL,
	"campaign_id" text NOT NULL,
	"data" date NOT NULL,
	"nome" text NOT NULL,
	"status" text NOT NULL,
	"estrategia" text NOT NULL,
	"canal" text,
	"orcamento" numeric(12, 2),
	"roas_objetivo" numeric(6, 2),
	"moeda" text,
	"campanha_criada_em" timestamp with time zone,
	"campanha_atualizada_em" timestamp with time zone,
	"clicks" integer,
	"prints" integer,
	"ctr" numeric(8, 4),
	"cost" numeric(12, 2),
	"cpc" numeric(10, 4),
	"acos" numeric(8, 4),
	"roas" numeric(8, 4),
	"cvr" numeric(8, 4),
	"sov" numeric(8, 4),
	"impression_share" numeric(8, 4),
	"top_impression_share" numeric(8, 4),
	"lost_impression_share_by_budget" numeric(8, 4),
	"lost_impression_share_by_ad_rank" numeric(8, 4),
	"acos_benchmark" numeric(8, 4),
	"organic_units_quantity" integer,
	"organic_units_amount" numeric(12, 2),
	"organic_items_quantity" integer,
	"direct_items_quantity" integer,
	"indirect_items_quantity" integer,
	"advertising_items_quantity" integer,
	"direct_units_quantity" integer,
	"indirect_units_quantity" integer,
	"units_quantity" integer,
	"direct_amount" numeric(12, 2),
	"indirect_amount" numeric(12, 2),
	"total_amount" numeric(12, 2),
	"bruto" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ads_advertiser" ADD CONSTRAINT "ads_advertiser_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads_advertiser" ADD CONSTRAINT "ads_advertiser_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads_advertiser" ADD CONSTRAINT "ads_advertiser_channel_account_id_channel_account_id_fk" FOREIGN KEY ("channel_account_id") REFERENCES "public"."channel_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads_anuncio_snapshot" ADD CONSTRAINT "ads_anuncio_snapshot_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads_anuncio_snapshot" ADD CONSTRAINT "ads_anuncio_snapshot_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads_anuncio_snapshot" ADD CONSTRAINT "ads_anuncio_snapshot_channel_account_id_channel_account_id_fk" FOREIGN KEY ("channel_account_id") REFERENCES "public"."channel_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads_anuncio_snapshot" ADD CONSTRAINT "ads_anuncio_snapshot_produto_id_produto_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."produto"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads_campanha_snapshot" ADD CONSTRAINT "ads_campanha_snapshot_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads_campanha_snapshot" ADD CONSTRAINT "ads_campanha_snapshot_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads_campanha_snapshot" ADD CONSTRAINT "ads_campanha_snapshot_channel_account_id_channel_account_id_fk" FOREIGN KEY ("channel_account_id") REFERENCES "public"."channel_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_ads_advertiser_conta" ON "ads_advertiser" USING btree ("org_id","channel_account_id");--> statement-breakpoint
CREATE INDEX "idx_ads_advertiser_brand" ON "ads_advertiser" USING btree ("brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_ads_anuncio_snapshot_dia" ON "ads_anuncio_snapshot" USING btree ("org_id","channel_account_id","campaign_id","item_id","data");--> statement-breakpoint
CREATE INDEX "idx_ads_anuncio_snapshot_brand" ON "ads_anuncio_snapshot" USING btree ("brand_id","data");--> statement-breakpoint
CREATE INDEX "idx_ads_anuncio_snapshot_produto" ON "ads_anuncio_snapshot" USING btree ("produto_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_ads_campanha_snapshot_dia" ON "ads_campanha_snapshot" USING btree ("org_id","channel_account_id","campaign_id","data");--> statement-breakpoint
CREATE INDEX "idx_ads_campanha_snapshot_brand" ON "ads_campanha_snapshot" USING btree ("brand_id","data");